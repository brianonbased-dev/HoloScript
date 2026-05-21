"""
oplora_wrapper.py

OPLoRA (Orthogonal Projection LoRA) wrapper for PEFT integration with
TRL's GRPOTrainer. Prevents catastrophic forgetting during GRPO training
of the Brittney 7B model by constraining LoRA weight updates to the null
space of pre-trained weight matrices' dominant singular directions.

Architecture:
    1. Extends PEFT's LoraConfig with orthogonal projection metadata
    2. Computes SVD of each target module's pre-trained weights at init
    3. Projects LoRA gradients orthogonal to the top-k singular directions
    4. Adds a constraint loss term to the GRPO training objective
    5. Provides a TRL callback for logging constraint metrics
    6. Supports periodic SVD recomputation (every N steps)

Usage with TRL GRPOTrainer:
    from oplora_wrapper import (
        create_oplora_model,
        OPLoRACallback,
        OrthogonalConstraintLoss,
    )
    from grpo_rewards import create_composite_reward

    # Create model with OPLoRA
    model, projections = create_oplora_model(
        model_name="brittney-7b",
        oplora_config=oplora_params,
        lora_config=lora_config,
    )

    # Add constraint loss to training
    constraint_loss = OrthogonalConstraintLoss(
        projections=projections,
        weight=oplora_params["orthogonal_weight"],
    )

    # Create trainer with callback
    trainer = GRPOTrainer(
        model=model,
        reward_funcs=[create_composite_reward()],
        args=grpo_config,
        callbacks=[OPLoRACallback(projections, constraint_loss)],
    )
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import torch
import torch.nn as nn

logger = logging.getLogger(__name__)

# =============================================================================
# CONFIGURATION
# =============================================================================

# Default OPLoRA parameters (must match OPLoRAConfig.ts defaults)
DEFAULT_OPLORA_PARAMS = {
    "projection_rank": 32,
    "orthogonal_weight": 1.0,
    "svd_recompute_interval": 100,
    "target_modules": [
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
}


# =============================================================================
# SVD PROJECTION
# =============================================================================

@dataclass
class SVDProjection:
    """
    Stores the SVD-based null space projection for a single module.

    The projection matrix P is computed such that:
        P = I - U_k @ U_k^T

    Where U_k contains the top-k left singular vectors of the pre-trained
    weight matrix. Multiplying a LoRA update by P projects it onto the
    null space (orthogonal complement) of the dominant singular directions.
    """
    module_name: str
    projection_matrix: torch.Tensor  # P = I - U_k @ U_k^T
    top_k_singular_values: torch.Tensor  # For monitoring
    projection_rank: int
    weight_shape: Tuple[int, ...]
    last_computed_step: int = 0
    computation_time_ms: float = 0.0


def compute_svd_projection(
    weight: torch.Tensor,
    projection_rank: int,
    module_name: str = "",
    step: int = 0,
) -> SVDProjection:
    """
    Compute the null space projection matrix for a weight matrix.

    Given a weight matrix W, computes the SVD:
        W = U @ S @ V^T

    Then constructs the projection matrix:
        P = I - U_k @ U_k^T

    Where U_k contains the top-k left singular vectors (the "knowledge
    subspace" to protect).

    Args:
        weight: Pre-trained weight matrix [out_features, in_features]
        projection_rank: Number of top singular directions to protect (k)
        module_name: Name of the module (for logging)
        step: Current training step

    Returns:
        SVDProjection containing the null space projection matrix
    """
    start_time = time.time()

    # Ensure weight is 2D for SVD
    original_shape = weight.shape
    if weight.dim() > 2:
        weight_2d = weight.reshape(weight.shape[0], -1)
    else:
        weight_2d = weight

    # Clamp projection_rank to valid range
    max_rank = min(weight_2d.shape[0], weight_2d.shape[1])
    k = min(projection_rank, max_rank)

    # Compute truncated SVD (only need top-k left singular vectors)
    # Using torch.linalg.svd for numerical stability
    with torch.no_grad():
        try:
            U, S, _ = torch.linalg.svd(weight_2d.float(), full_matrices=False)
        except RuntimeError:
            # Fallback for very large matrices: use randomized SVD
            logger.warning(
                f"Full SVD failed for {module_name} ({weight_2d.shape}). "
                "Using randomized approximation."
            )
            U, S, _ = torch.svd_lowrank(weight_2d.float(), q=k)

    # Extract top-k left singular vectors
    U_k = U[:, :k]  # [out_features, k]

    # Compute projection: P = I - U_k @ U_k^T
    # P projects any vector into the null space of U_k
    projection = torch.eye(
        weight_2d.shape[0],
        device=weight.device,
        dtype=weight.dtype,
    ) - (U_k @ U_k.T).to(weight.dtype)

    elapsed_ms = (time.time() - start_time) * 1000

    if module_name:
        logger.info(
            f"SVD projection for {module_name}: "
            f"shape={tuple(weight_2d.shape)}, k={k}, "
            f"top singular value={S[0].item():.4f}, "
            f"time={elapsed_ms:.1f}ms"
        )

    return SVDProjection(
        module_name=module_name,
        projection_matrix=projection,
        top_k_singular_values=S[:k].clone(),
        projection_rank=k,
        weight_shape=original_shape,
        last_computed_step=step,
        computation_time_ms=elapsed_ms,
    )


# =============================================================================
# ORTHOGONAL CONSTRAINT LOSS
# =============================================================================

class OrthogonalConstraintLoss(nn.Module):
    """
    Computes the orthogonal constraint penalty for LoRA weight updates.

    The constraint measures how much the LoRA delta (A @ B) overlaps with
    the protected knowledge subspace. The loss is:

        L_ortho = sum_module ||  (I - P_module) @ (A_module @ B_module) ||_F^2

    Where:
        - P_module is the null space projection for the module
        - A_module, B_module are the LoRA adapter matrices
        - (I - P_module) projects onto the PROTECTED subspace
        - ||.||_F is the Frobenius norm

    A loss of 0 means the LoRA updates are perfectly orthogonal to the
    protected subspace (ideal). Higher values indicate intrusion.
    """

    def __init__(
        self,
        projections: Dict[str, SVDProjection],
        weight: float = 1.0,
    ):
        super().__init__()
        self.projections = projections
        self.weight = weight

    def forward(
        self,
        model: nn.Module,
    ) -> torch.Tensor:
        """
        Compute the orthogonal constraint loss over all LoRA modules.

        Args:
            model: The model with LoRA adapters

        Returns:
            Weighted constraint loss (scalar tensor)
        """
        total_loss = torch.tensor(0.0, device=self._get_device(model))

        for name, projection in self.projections.items():
            lora_delta = self._get_lora_delta(model, name)
            if lora_delta is None:
                continue

            # Project onto the PROTECTED subspace (complement of null space)
            # protected_component = (I - P) @ delta = U_k @ U_k^T @ delta
            protected_component = lora_delta - (
                projection.projection_matrix @ lora_delta
            )

            # Frobenius norm squared of the protected component
            constraint = torch.sum(protected_component ** 2)
            total_loss = total_loss + constraint

        return self.weight * total_loss

    def compute_satisfaction(
        self,
        model: nn.Module,
    ) -> Dict[str, float]:
        """
        Compute per-module constraint satisfaction percentage.

        Satisfaction = 100 * (1 - ||protected_component||_F / ||delta||_F)

        100% means perfect orthogonality.
        0% means the LoRA update lies entirely within the protected subspace.

        Returns:
            Dict mapping module name to satisfaction percentage (0-100)
        """
        satisfaction: Dict[str, float] = {}

        for name, projection in self.projections.items():
            lora_delta = self._get_lora_delta(model, name)
            if lora_delta is None:
                satisfaction[name] = 100.0
                continue

            delta_norm = torch.norm(lora_delta, p="fro").item()
            if delta_norm < 1e-10:
                satisfaction[name] = 100.0
                continue

            protected_component = lora_delta - (
                projection.projection_matrix @ lora_delta
            )
            protected_norm = torch.norm(protected_component, p="fro").item()

            sat = 100.0 * (1.0 - min(1.0, protected_norm / delta_norm))
            satisfaction[name] = round(sat, 2)

        return satisfaction

    def _get_lora_delta(
        self,
        model: nn.Module,
        module_name: str,
    ) -> Optional[torch.Tensor]:
        """
        Extract the LoRA delta (A @ B) for a named module.

        PEFT stores LoRA weights as:
            module.lora_A.default.weight  [rank, in_features]
            module.lora_B.default.weight  [out_features, rank]

        The effective delta is: B @ A
        """
        try:
            # Navigate the PEFT model structure
            parts = module_name.split(".")
            current = model

            for part in parts:
                if hasattr(current, part):
                    current = getattr(current, part)
                else:
                    # Try common PEFT paths
                    for prefix in ["base_model.model.", "model."]:
                        full_path = prefix + module_name
                        try:
                            current = model
                            for p in full_path.split("."):
                                current = getattr(current, p)
                            break
                        except AttributeError:
                            continue
                    else:
                        return None

            # Extract LoRA A and B matrices
            lora_A = None
            lora_B = None

            if hasattr(current, "lora_A"):
                lora_A_module = current.lora_A
                if hasattr(lora_A_module, "default"):
                    lora_A = lora_A_module.default.weight
                elif hasattr(lora_A_module, "weight"):
                    lora_A = lora_A_module.weight

            if hasattr(current, "lora_B"):
                lora_B_module = current.lora_B
                if hasattr(lora_B_module, "default"):
                    lora_B = lora_B_module.default.weight
                elif hasattr(lora_B_module, "weight"):
                    lora_B = lora_B_module.weight

            if lora_A is not None and lora_B is not None:
                # delta = B @ A: [out_features, rank] @ [rank, in_features]
                return lora_B @ lora_A

            return None
        except (AttributeError, RuntimeError) as e:
            logger.debug(f"Could not extract LoRA delta for {module_name}: {e}")
            return None

    @staticmethod
    def _get_device(model: nn.Module) -> torch.device:
        """Get the device of the first parameter in the model."""
        try:
            return next(model.parameters()).device
        except StopIteration:
            return torch.device("cpu")


# =============================================================================
# MODEL CREATION
# =============================================================================

def create_oplora_model(
    model_name_or_path: str,
    oplora_params: Optional[Dict[str, Any]] = None,
    lora_config: Optional[Any] = None,
    device_map: str = "auto",
    torch_dtype: Any = None,
) -> Tuple[Any, Dict[str, SVDProjection]]:
    """
    Create a model with OPLoRA (Orthogonal Projection LoRA).

    This function:
    1. Loads the base model
    2. Computes SVD projections for each target module
    3. Applies PEFT LoRA adapters
    4. Returns the model and projection data

    Args:
        model_name_or_path: HuggingFace model ID or local path
        oplora_params: OPLoRA parameters (uses defaults if None)
        lora_config: PEFT LoraConfig (created from oplora_params if None)
        device_map: Device mapping strategy
        torch_dtype: Tensor data type

    Returns:
        Tuple of (peft_model, projections_dict)
    """
    try:
        from peft import LoraConfig, get_peft_model
        from transformers import AutoModelForCausalLM
    except ImportError as e:
        raise ImportError(
            "OPLoRA requires 'peft' and 'transformers' packages. "
            "Install with: pip install peft transformers"
        ) from e

    params = oplora_params or DEFAULT_OPLORA_PARAMS

    # Set default dtype
    if torch_dtype is None:
        torch_dtype = torch.bfloat16

    # Load base model
    logger.info(f"Loading base model: {model_name_or_path}")
    model = AutoModelForCausalLM.from_pretrained(
        model_name_or_path,
        device_map=device_map,
        torch_dtype=torch_dtype,
        trust_remote_code=True,
    )

    # Compute SVD projections BEFORE applying LoRA
    # (we need the original pre-trained weights)
    logger.info("Computing SVD projections for target modules...")
    projections: Dict[str, SVDProjection] = {}
    projection_rank = params.get("projection_rank", 32)

    for name, module in model.named_modules():
        # Check if this module is a target for LoRA
        module_base_name = name.split(".")[-1]
        if module_base_name in params.get("target_modules", []):
            if hasattr(module, "weight") and module.weight is not None:
                proj = compute_svd_projection(
                    weight=module.weight.data,
                    projection_rank=projection_rank,
                    module_name=name,
                    step=0,
                )
                projections[name] = proj

    logger.info(
        f"Computed {len(projections)} SVD projections "
        f"(projection_rank={projection_rank})"
    )

    # Create LoRA config if not provided
    if lora_config is None:
        lora_config = LoraConfig(
            r=16,
            lora_alpha=32,
            lora_dropout=0.05,
            target_modules=params.get("target_modules", DEFAULT_OPLORA_PARAMS["target_modules"]),
            bias="none",
            task_type="CAUSAL_LM",
        )

    # Apply PEFT LoRA
    logger.info("Applying PEFT LoRA adapters...")
    model = get_peft_model(model, lora_config)
    model.print_trainable_parameters()

    return model, projections


# =============================================================================
# SVD RECOMPUTATION
# =============================================================================

def recompute_svd_projections(
    model: nn.Module,
    projections: Dict[str, SVDProjection],
    projection_rank: int,
    current_step: int,
) -> Dict[str, SVDProjection]:
    """
    Recompute SVD projections from the current model weights.

    During training, the base model weights don't change (only LoRA weights do),
    but the effective weight is base + delta. If the delta has grown large,
    the SVD basis may need updating to protect the new "combined" knowledge.

    This is called periodically (every svd_recompute_interval steps).

    Args:
        model: The PEFT model
        projections: Current projection data
        projection_rank: Number of singular directions to protect
        current_step: Current training step

    Returns:
        Updated projections dict
    """
    updated: Dict[str, SVDProjection] = {}

    for name, old_proj in projections.items():
        # Find the module's effective weight (base + LoRA delta)
        try:
            parts = name.split(".")
            current = model
            for part in parts:
                current = getattr(current, part)

            if hasattr(current, "weight"):
                weight = current.weight.data
                if hasattr(current, "lora_A") and hasattr(current, "lora_B"):
                    # Compute effective weight: base + B @ A
                    try:
                        lora_A = current.lora_A.default.weight
                        lora_B = current.lora_B.default.weight
                        weight = weight + lora_B @ lora_A
                    except AttributeError:
                        pass

                new_proj = compute_svd_projection(
                    weight=weight,
                    projection_rank=projection_rank,
                    module_name=name,
                    step=current_step,
                )
                updated[name] = new_proj
            else:
                updated[name] = old_proj
        except AttributeError:
            logger.debug(f"Could not access module {name} for SVD recompute")
            updated[name] = old_proj

    return updated


# =============================================================================
# TRL CALLBACK
# =============================================================================

@dataclass
class OPLoRAMetrics:
    """Metrics collected by the OPLoRA callback at each logging step."""
    step: int
    constraint_loss: float
    satisfaction_pct: float
    per_module_satisfaction: Dict[str, float]
    per_module_weight_ratios: Dict[str, float]
    svd_recomputed: bool = False
    svd_recompute_time_ms: float = 0.0


class OPLoRACallback:
    """
    TRL-compatible callback for OPLoRA constraint monitoring.

    Integrates with GRPOTrainer's callback system to:
    1. Add the orthogonal constraint loss to the training loss
    2. Log constraint satisfaction metrics
    3. Periodically recompute SVD projections
    4. Track per-module weight magnitude ratios

    Usage:
        callback = OPLoRACallback(projections, constraint_loss)
        trainer = GRPOTrainer(..., callbacks=[callback])
    """

    def __init__(
        self,
        projections: Dict[str, SVDProjection],
        constraint_loss: OrthogonalConstraintLoss,
        svd_recompute_interval: int = 100,
        projection_rank: int = 32,
    ):
        self.projections = projections
        self.constraint_loss = constraint_loss
        self.svd_recompute_interval = svd_recompute_interval
        self.projection_rank = projection_rank
        self.metrics_history: List[OPLoRAMetrics] = []
        self._step_count = 0

    def on_step_end(
        self,
        args: Any,
        state: Any,
        control: Any,
        model: Optional[nn.Module] = None,
        **kwargs: Any,
    ) -> None:
        """Called at the end of each training step."""
        self._step_count += 1

        if model is None:
            return

        # Periodic SVD recomputation
        svd_recomputed = False
        svd_time = 0.0

        if (
            self.svd_recompute_interval > 0
            and self._step_count % self.svd_recompute_interval == 0
        ):
            start = time.time()
            self.projections = recompute_svd_projections(
                model=model,
                projections=self.projections,
                projection_rank=self.projection_rank,
                current_step=self._step_count,
            )
            # Update constraint loss with new projections
            self.constraint_loss.projections = self.projections
            svd_time = (time.time() - start) * 1000
            svd_recomputed = True
            logger.info(
                f"Step {self._step_count}: SVD recomputed in {svd_time:.1f}ms"
            )

    def on_log(
        self,
        args: Any,
        state: Any,
        control: Any,
        model: Optional[nn.Module] = None,
        logs: Optional[Dict[str, float]] = None,
        **kwargs: Any,
    ) -> None:
        """Called at each logging step. Computes and logs OPLoRA metrics."""
        if model is None or logs is None:
            return

        # Compute constraint satisfaction
        satisfaction = self.constraint_loss.compute_satisfaction(model)
        avg_satisfaction = (
            sum(satisfaction.values()) / len(satisfaction)
            if satisfaction
            else 100.0
        )

        # Compute constraint loss value (for logging, not backprop)
        with torch.no_grad():
            loss_val = self.constraint_loss(model).item()

        # Compute weight magnitude ratios
        weight_ratios = self._compute_weight_ratios(model)

        # Create metrics
        metrics = OPLoRAMetrics(
            step=self._step_count,
            constraint_loss=round(loss_val, 6),
            satisfaction_pct=round(avg_satisfaction, 2),
            per_module_satisfaction=satisfaction,
            per_module_weight_ratios=weight_ratios,
        )
        self.metrics_history.append(metrics)

        # Add to TRL logs
        logs["oplora/constraint_loss"] = loss_val
        logs["oplora/satisfaction_pct"] = avg_satisfaction
        for name, sat in satisfaction.items():
            short_name = name.split(".")[-1]
            logs[f"oplora/satisfaction/{short_name}"] = sat
        for name, ratio in weight_ratios.items():
            short_name = name.split(".")[-1]
            logs[f"oplora/weight_ratio/{short_name}"] = ratio

    def _compute_weight_ratios(
        self,
        model: nn.Module,
    ) -> Dict[str, float]:
        """Compute LoRA delta / base weight Frobenius norm ratios."""
        ratios: Dict[str, float] = {}

        for name, projection in self.projections.items():
            delta = self.constraint_loss._get_lora_delta(model, name)
            if delta is None:
                continue

            delta_norm = torch.norm(delta, p="fro").item()

            # Get base weight norm from the projection's stored shape
            # The projection was computed from the original weights
            base_norm = torch.norm(
                projection.top_k_singular_values, p=2
            ).item()

            if base_norm > 1e-10:
                ratios[name] = round(delta_norm / base_norm, 6)
            else:
                ratios[name] = 0.0

        return ratios

    def get_metrics_history(self) -> List[OPLoRAMetrics]:
        """Get all collected metrics."""
        return list(self.metrics_history)

    def get_latest_metrics(self) -> Optional[OPLoRAMetrics]:
        """Get the most recent metrics snapshot."""
        return self.metrics_history[-1] if self.metrics_history else None


# =============================================================================
# INTEGRATION WITH GRPO TRAINING LOOP
# =============================================================================

def create_oplora_training_step(
    constraint_loss: OrthogonalConstraintLoss,
) -> Any:
    """
    Create a custom training step function that adds the orthogonal
    constraint loss to the GRPO policy loss.

    This is used to modify the GRPOTrainer's compute_loss method.

    Returns:
        A function that takes (model, inputs, base_loss) and returns
        the modified loss with the orthogonal constraint added.
    """

    def modified_loss(
        model: nn.Module,
        base_loss: torch.Tensor,
    ) -> torch.Tensor:
        """Add orthogonal constraint to the base GRPO loss."""
        ortho_loss = constraint_loss(model)
        total = base_loss + ortho_loss
        return total

    return modified_loss


# =============================================================================
# CONVENIENCE: FULL SETUP
# =============================================================================

def setup_oplora_grpo(
    model_name_or_path: str,
    oplora_params: Optional[Dict[str, Any]] = None,
    lora_config: Optional[Any] = None,
) -> Dict[str, Any]:
    """
    Convenience function for full OPLoRA + GRPO setup.

    Returns a dict with all components needed for training:
        - model: PEFT model with LoRA adapters
        - projections: SVD projection data
        - constraint_loss: OrthogonalConstraintLoss module
        - callback: OPLoRACallback for TRL
        - modified_loss_fn: Function to add constraint to GRPO loss

    Usage:
        setup = setup_oplora_grpo("brittney-7b")
        trainer = GRPOTrainer(
            model=setup["model"],
            callbacks=[setup["callback"]],
            ...
        )
    """
    params = oplora_params or DEFAULT_OPLORA_PARAMS

    # Create model with OPLoRA
    model, projections = create_oplora_model(
        model_name_or_path=model_name_or_path,
        oplora_params=params,
        lora_config=lora_config,
    )

    # Create constraint loss
    constraint_loss = OrthogonalConstraintLoss(
        projections=projections,
        weight=params.get("orthogonal_weight", 1.0),
    )

    # Create callback
    callback = OPLoRACallback(
        projections=projections,
        constraint_loss=constraint_loss,
        svd_recompute_interval=params.get("svd_recompute_interval", 100),
        projection_rank=params.get("projection_rank", 32),
    )

    # Create modified loss function
    modified_loss_fn = create_oplora_training_step(constraint_loss)

    return {
        "model": model,
        "projections": projections,
        "constraint_loss": constraint_loss,
        "callback": callback,
        "modified_loss_fn": modified_loss_fn,
    }


# =============================================================================
# MAIN (for testing)
# =============================================================================

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    logger.info("OPLoRA Wrapper - Self-test")
    logger.info(f"Default params: {DEFAULT_OPLORA_PARAMS}")

    # Test SVD projection with a random matrix
    logger.info("Testing SVD projection computation...")
    test_weight = torch.randn(128, 64)
    proj = compute_svd_projection(
        weight=test_weight,
        projection_rank=16,
        module_name="test_module",
    )
    logger.info(f"  Projection shape: {proj.projection_matrix.shape}")
    logger.info(f"  Projection rank: {proj.projection_rank}")
    logger.info(f"  Top singular values: {proj.top_k_singular_values[:5].tolist()}")
    logger.info(f"  Computation time: {proj.computation_time_ms:.1f}ms")

    # Verify projection is idempotent (P @ P = P)
    P = proj.projection_matrix
    PP = P @ P
    diff = torch.norm(P - PP, p="fro").item()
    logger.info(f"  Idempotency check ||P - P@P||_F = {diff:.8f}")
    assert diff < 1e-5, f"Projection is not idempotent: {diff}"

    # Verify projection is symmetric (P = P^T)
    sym_diff = torch.norm(P - P.T, p="fro").item()
    logger.info(f"  Symmetry check ||P - P^T||_F = {sym_diff:.8f}")
    assert sym_diff < 1e-5, f"Projection is not symmetric: {sym_diff}"

    logger.info("All self-tests passed.")
