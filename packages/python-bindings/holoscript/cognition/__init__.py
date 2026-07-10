"""HoloScript cognition surfaces — make agent reasoning visible.

decision_network: feed a shared decision stream that renders to a native, receipt-bound
picture via the sovereign SVGCompiler (one surface for all families).
"""
from .decision_network import record_decision, read_log, render

__all__ = ["record_decision", "read_log", "render"]
