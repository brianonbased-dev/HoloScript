from holoscript import list_traits, parse, validate


def test_parse_success() -> None:
    result = parse('cube { @color(red) @position(0, 1, 0) @grabbable }')
    assert result.success is True
    assert result.ast["type"] == "composition"


def test_validate_success() -> None:
    result = validate('cube { @grabbable }')
    assert result.valid is True


def test_list_traits_returns_values() -> None:
    traits = list_traits()
    assert len(traits) > 0
    assert "@grabbable" in traits
