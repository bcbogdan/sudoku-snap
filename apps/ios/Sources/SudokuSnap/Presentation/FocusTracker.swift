import Foundation

struct FocusTracker {
    private(set) var pending: [FocusInterval] = []
    private var start: UInt64?

    mutating func resume(at: UInt64) {
        if start == nil { start = at }
    }

    mutating func checkpoint(at: UInt64, continuing: Bool) {
        if let start, at > start { pending.append(FocusInterval(start: start, end: at)) }
        start = continuing ? at : nil
    }

    mutating func acknowledge(_ intervals: [FocusInterval]) {
        guard pending.starts(with: intervals) else { return }
        pending.removeFirst(intervals.count)
    }

    mutating func discard() { pending = []; start = nil }
}
