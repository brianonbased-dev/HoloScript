---
'@holoscript/qm-bridge': minor
---

Add CliffordDiagonalization: entangled measurement circuits for general-commuting Pauli groups. `groupPauliTerms` colors on general commutativity (N2: 383 terms → 22 groups, matching IBM's 21), but its single-qubit measurement bases can only realize qubit-wise-commuting groups — for N2, 1 of the 22. `diagonalizeCommutingGroup` synthesizes the Clifford circuit (h/s/sdg/cx/cz) that simultaneously diagonalizes any pairwise-commuting group via symplectic tableau elimination, with exact CHP sign tracking that doubles as a built-in validator (a non-diagonal result throws instead of shipping a wrong circuit). Also: `measurementPlanForGroup` (PauliGrouping integration), `expectationFromCounts` (bitstring → energy reconstruction, qiskit or qubit-index bit order), `measurementCircuitQasm3` (OpenQASM 3 emission), and a corrected PauliGrouping docstring citing the measured N2 receipt.
