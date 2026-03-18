"""
End-to-end pipeline test: parse -> validate -> generate -> share.
Validates the full Grok flow with social trait support.
"""

import pytest
from holoscript import (
    parse,
    validate,
    generate,
    generate_scene,
    share,
    suggest_traits,
    list_traits,
)


class TestFullPipeline:
    """Tests the complete generate -> validate -> share chain."""

    def test_generate_validate_share(self):
        """Full pipeline: generate, validate, share."""
        # 1. Generate
        result = generate("a glowing sphere in a dark cave")
        assert result.code
        assert len(result.code) > 0

        # 2. Validate
        validation = validate(result.code)
        assert validation.valid is True, f"Validation failed: {validation.errors}"

        # 3. Share
        share_result = share(result.code, title="Cave Sphere", platform="x")
        assert share_result.playground_url
        assert share_result.tweet_text
        assert "Cave Sphere" in share_result.tweet_text
        assert share_result.qr_code
        assert share_result.card_meta
        assert share_result.card_meta["twitter:card"] == "player"

    def test_generate_scene_validate(self):
        """Generate a full scene and validate it."""
        result = generate_scene("enchanted forest with glowing mushrooms")
        assert result.code
        assert "composition" in result.code

        validation = validate(result.code)
        assert validation.valid is True, f"Validation failed: {validation.errors}"

    def test_social_trait_discoverability(self):
        """Social traits should be discoverable via list_traits."""
        traits = list_traits("social")
        assert "social" in traits
        assert "@shareable" in traits["social"]
        assert "@collaborative" in traits["social"]
        assert "@tweetable" in traits["social"]

    def test_social_trait_suggestion_share(self):
        """suggest_traits should suggest @shareable for share keywords."""
        result = suggest_traits("share this artwork and tweet about it")
        assert "@shareable" in result["traits"]
        assert "@tweetable" in result["traits"]

    def test_social_trait_suggestion_collaborate(self):
        """suggest_traits should suggest @collaborative."""
        result = suggest_traits("collaborate on this scene together")
        assert "@collaborative" in result["traits"]

    def test_social_traits_not_flagged_as_unknown(self):
        """Social traits should not produce 'unknown trait' warnings."""
        code = '''composition "Social" {
  object "Art" @shareable @collaborative @tweetable {
    geometry: "sphere"
    color: "#ff0000"
  }
}'''
        validation = validate(code)
        # Check no unknown trait warnings for social traits
        trait_warnings = [
            e for e in validation.errors
            if "unknown trait" in e.message.lower()
            and any(t in e.message for t in ["shareable", "collaborative", "tweetable"])
        ]
        assert len(trait_warnings) == 0, f"Social traits flagged as unknown: {trait_warnings}"

    def test_version_consistency(self):
        """Package version should be 5.3.0."""
        import holoscript
        assert holoscript.__version__ == "5.3.0"
