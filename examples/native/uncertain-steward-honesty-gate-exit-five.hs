struct StewardSnapshot {
    @unknown orphanCount: i32
}

struct StewardReceipt {
    counterPresent: bool,
    removals: i32,
    abstainReason: i32
}

function stewardHonestyGate(
    snapshot: &StewardSnapshot,
    receipt: &mut StewardReceipt
): i32 {
    if (isKnown(snapshot.orphanCount)) {
        let count: i32 = load(snapshot.orphanCount) ?? 0
        store(receipt.counterPresent, true)
        store(receipt.removals, count)
        return count
    }

    store(receipt.abstainReason, unknownReason(snapshot.orphanCount))
    return 0
}

function main(): i32 {
    slot missing: StewardSnapshot =
        StewardSnapshot(unknown("missing_precondition"))
    slot abstention: StewardReceipt = StewardReceipt(false, 99, 0)
    let abstained: i32 = stewardHonestyGate(&missing, &mut abstention)

    if (abstained != 0) { return 1 }
    if (load(abstention.counterPresent)) { return 2 }
    if (load(abstention.removals) != 99) { return 3 }
    if (load(abstention.abstainReason) != 4) { return 4 }

    slot present: StewardSnapshot = StewardSnapshot(known(5))
    slot decisionReceipt: StewardReceipt = StewardReceipt(false, 0, 0)
    let proceeded: i32 = stewardHonestyGate(&present, &mut decisionReceipt)

    if (!load(decisionReceipt.counterPresent)) { return 6 }
    if (proceeded != load(decisionReceipt.removals)) { return 7 }
    return load(decisionReceipt.removals)
}
