import SwiftUI

private enum GameSheet: String, Identifiable {
    case rename, photo, share
    var id: String { rawValue }
}

struct GameView: View {
    @Bindable var model: AppModel
    @State private var sheet: GameSheet?
    @State private var name = ""
    @State private var deleting = false

    var body: some View {
        if let game = model.game, let position = model.displayedPosition {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if model.isDraft {
                        Text("Review clues").font(.title2.bold())
                        Text(model.recognitionDiagnostic ?? "Select a cell and enter a clue. Use Erase for empty cells. Finalize checks that the puzzle has exactly one solution.")
                        Text("\(model.draftUncertain.count) cells need review").font(.subheadline)
                    } else {
                        Text(game.completed ? "Completed — read only" : model.historyStep == nil ? "Playing" : "History — read only").font(.headline)
                        Text("\(position.mistakes) mistakes · \(game.activeMs / 1_000) seconds focused").monospacedDigit()
                    }
                    BoardView(board: model.isDraft ? model.draftClues : position.board,
                              notes: position.notes, clues: model.isDraft ? Array(repeating: 0, count: 81) : game.puzzle.clues,
                              uncertain: model.isDraft ? model.draftUncertain : [], editable: model.canEdit, selection: $model.selection)
                    if let selected = model.selection { Text("Selected: row \(Int(selected) / 9 + 1), column \(Int(selected) % 9 + 1)").font(.subheadline) }
                    if model.canEdit {
                        LazyVGrid(columns: [GridItem(.adaptive(minimum: 64))]) {
                            ForEach(1...9, id: \.self) { value in
                                Button(String(value)) { model.enter(UInt8(value)) }
                                    .buttonStyle(.bordered).frame(minHeight: 44)
                                    .accessibilityLabel(model.notesMode && !model.isDraft ? "Toggle note \(value)" : "Enter \(value)")
                            }
                            Button("Erase") { model.enter(0) }.buttonStyle(.bordered).frame(minHeight: 44)
                        }
                        .disabled(model.selection == nil)
                        if !model.isDraft {
                            Toggle("Notes", isOn: $model.notesMode)
                            Toggle("Count mistakes", isOn: $model.checking)
                            Button("Undo", systemImage: "arrow.uturn.backward", action: model.undo).disabled(!game.canUndo)
                        }
                    }
                    if model.isDraft {
                        Button("Save review") { model.saveDraft(finalize: false) }.buttonStyle(.bordered)
                        Button("Finalize and play") { model.saveDraft(finalize: true) }.buttonStyle(.borderedProminent)
                            .disabled(model.pendingOperations > 0)
                    } else {
                        historyControls(game)
                    }
                    if game.photo != nil { Button("View source photo") { sheet = .photo } }
                    Button("Rename") { name = game.puzzle.name; sheet = .rename }
                    Button("Share puzzle link") { model.share(); sheet = .share }
                    Button("Delete puzzle", role: .destructive) { deleting = true }
                }
                .padding()
            }
            .navigationTitle(game.puzzle.name)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .topBarLeading) { Button("Library", action: model.close) } }
            .confirmationDialog("Delete this puzzle, progress, and source photo?", isPresented: $deleting, titleVisibility: .visible) {
                Button("Delete puzzle", role: .destructive, action: model.deleteCurrent)
            }
            .onChange(of: sheet) { _, sheet in model.setModalPresented(sheet != nil) }
            .onChange(of: deleting) { _, deleting in model.setModalPresented(deleting) }
            .sheet(item: $sheet) { sheet in
                NavigationStack {
                    Group {
                        switch sheet {
                        case .rename:
                            Form {
                                TextField("Puzzle name", text: $name)
                                Button("Save name") { model.rename(name); self.sheet = nil }
                            }
                        case .photo:
                            if let data = game.photo, let image = UIImage(data: data) {
                                ScrollView([.horizontal, .vertical]) {
                                    Image(uiImage: image).resizable().scaledToFit().frame(minWidth: 320, maxWidth: 1_200)
                                        .accessibilityLabel("Original puzzle photo. Return to review to correct clues.")
                                }
                            }
                        case .share:
                            VStack(spacing: 20) {
                                Text("This app link shares clues and name, without your progress or photo.")
                                if let url = model.shareURL { ShareLink("Share link", item: url) }
                                else { ProgressView("Preparing link…") }
                            }.padding()
                        }
                    }
                    .toolbar { Button("Done") { self.sheet = nil } }
                }
            }
        }
    }

    private func historyControls(_ game: GameSnapshot) -> some View {
        VStack(alignment: .leading) {
            if let step = model.historyStep {
                Text("Snapshot \(step) of \(game.revision)")
                HStack {
                    Button("Previous") { model.showHistory(step - 1) }.disabled(step == 0)
                    Button("Next") { model.showHistory(step + 1) }.disabled(step == game.revision)
                }
                Button("Return to latest") { model.showHistory(nil) }
            } else {
                Button("Browse history") { model.showHistory(game.revision) }
            }
        }
    }
}
