class CijfercodeError(Exception):
    """Basisklasse voor verwachte applicatiefouten."""


class LexiconUnavailable(CijfercodeError):
    """De lokale woordenlijst ontbreekt of is ongeldig."""


class GenerationExhausted(CijfercodeError):
    """Binnen het pogingbudget kon geen geschikte puzzel worden gemaakt."""

    def __init__(self, attempts: int, reason: str) -> None:
        self.attempts = attempts
        self.reason = reason
        super().__init__(f"Geen geschikte puzzel na {attempts} pogingen: {reason}")
