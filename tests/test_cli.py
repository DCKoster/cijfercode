from cijfercode.cli import build_parser, main


def test_cli_grid_size_defaults_and_overrides():
    parser = build_parser()
    defaults = parser.parse_args(["generate", "--difficulty", "1"])
    custom = parser.parse_args(
        [
            "generate",
            "--difficulty",
            "2",
            "--width",
            "15",
            "--height",
            "15",
            "--givens",
            "0",
        ]
    )
    assert (defaults.width, defaults.height) == (17, 20)
    assert defaults.givens is None
    assert (custom.width, custom.height) == (15, 15)
    assert custom.givens == 0


def test_cli_rejects_invalid_given_count():
    parser = build_parser()
    for value in ("-1", "27"):
        try:
            parser.parse_args(["generate", "--difficulty", "1", "--givens", value])
        except SystemExit as error:
            assert error.code == 2
        else:
            raise AssertionError("ongeldig aantal hints moet worden geweigerd")


def test_cli_returns_readable_error_for_missing_cache(tmp_path, capsys):
    exit_code = main(
        [
            "generate",
            "--difficulty",
            "1",
            "--cache-dir",
            str(tmp_path),
            "--max-attempts",
            "1",
        ]
    )
    assert exit_code == 2
    assert "words sync" in capsys.readouterr().err
