import SwiftUI

struct BoardView: View {
    let board: [UInt8]
    let notes: [[UInt8]]
    let clues: [UInt8]
    let uncertain: [UInt8]
    let editable: Bool
    @Binding var selection: UInt8?
    @ScaledMetric(relativeTo: .body) private var cellSize = 38

    var body: some View {
        ScrollView([.horizontal, .vertical]) {
            Grid(horizontalSpacing: 0, verticalSpacing: 0) {
                ForEach(0..<9) { row in
                    GridRow {
                        ForEach(0..<9) { column in
                            let index = row * 9 + column
                            Button { selection = UInt8(index) } label: {
                                VStack(spacing: 0) {
                                    if board[index] != 0 {
                                        Text(String(board[index]))
                                            .fontWeight(clues[index] != 0 ? .bold : .regular)
                                    } else if !notes[index].isEmpty {
                                        Text(notes[index].map(String.init).joined(separator: " "))
                                            .font(.caption2).multilineTextAlignment(.center)
                                    } else {
                                        Text(" ")
                                    }
                                    if uncertain.contains(UInt8(index)) { Text("?").font(.caption2) }
                                }
                                .frame(width: max(38, cellSize), height: max(44, cellSize))
                                .foregroundStyle(.primary)
                                .background(selection == UInt8(index) ? Color.accentColor.opacity(0.2) : Color(uiColor: .systemBackground))
                                .border(Color.primary.opacity(0.3), width: 0.5)
                                .overlay(alignment: .trailing) { if column == 2 || column == 5 { Rectangle().frame(width: 2) } }
                                .overlay(alignment: .bottom) { if row == 2 || row == 5 { Rectangle().frame(height: 2) } }
                                .overlay { if selection == UInt8(index) { Rectangle().strokeBorder(Color.accentColor, lineWidth: 3) } }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(label(index))
                            .accessibilityHint(editable ? "Select cell, then use the number buttons below." : "Read only")
                            .accessibilityAddTraits(selection == UInt8(index) ? [.isSelected] : [])
                        }
                    }
                }
            }
            .border(Color.primary, width: 2)
            .padding(2)
        }
        .frame(minHeight: max(44, cellSize) * 9 + 4, maxHeight: max(44, cellSize) * 9 + 4)
    }

    private func label(_ index: Int) -> String {
        let value = board[index] == 0 ? "empty" : String(board[index])
        let note = notes[index].isEmpty ? "" : ", notes " + notes[index].map(String.init).joined(separator: ", ")
        let given = clues[index] == 0 ? "" : ", given"
        let uncertainty = uncertain.contains(UInt8(index)) ? ", review needed" : ""
        return "Row \(index / 9 + 1), column \(index % 9 + 1), \(value)\(given)\(note)\(uncertainty)"
    }
}
