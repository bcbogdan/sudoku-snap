import PhotosUI
import SwiftUI

private enum ImportSheet: String, Identifiable {
    case link
    var id: String { rawValue }
}

struct RootView: View {
    @State private var model: AppModel
    @State private var photo: PhotosPickerItem?
    @State private var sheet: ImportSheet?
    @State private var pastedLink = ""
    @Environment(\.scenePhase) private var phase

    init(repository: LibraryRepository) {
        _model = State(initialValue: AppModel(repository: repository))
    }

    var body: some View {
        NavigationStack {
            Group {
                if model.game != nil {
                    GameView(model: model)
                } else {
                    List {
                        Section("Add a puzzle") {
                            Button("Enter clues manually", systemImage: "square.and.pencil", action: model.newDraft)
                            PhotosPicker(selection: $photo, matching: .images) {
                                Label("Choose puzzle photo", systemImage: "photo")
                            }
                            Button("Paste puzzle link", systemImage: "link") { sheet = .link }
                        }
                        if model.isRecognizing {
                            Section {
                                ProgressView("Reading grid…")
                                Button("Cancel recognition", role: .cancel, action: model.cancelRecognition)
                            }
                        }
                        Section("Your library") {
                            if model.library.isEmpty { Text("Add a puzzle to get started.").foregroundStyle(.secondary) }
                            ForEach(model.library) { item in
                                Button { model.open(item.id) } label: {
                                    VStack(alignment: .leading) {
                                        Text(item.puzzle.name).foregroundStyle(.primary)
                                        Text(item.puzzle.status == "draft" ? "Draft — review clues" : "Ready to play").font(.subheadline).foregroundStyle(.secondary)
                                    }
                                }
                            }
                        }
                    }
                    .navigationTitle("Sudoku Snap")
                }
            }
        }
        .task { model.refresh() }
        .task {
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(15)) } catch { return }
                model.tick()
            }
        }
        .task(id: photo) {
            guard let photo else { return }
            let ticket = model.beginPhotoImport()
            do {
                guard let data = try await photo.loadTransferable(type: Data.self) else { throw HostError.invalidPhoto }
                try Task.checkCancellation()
                model.recognize(data, ticket: ticket)
            } catch { model.photoImportFailed(error, ticket: ticket) }
        }
        .onChange(of: phase) { _, phase in model.sceneActive(phase == .active) }
        .onOpenURL { model.importURL($0) }
        .alert("Couldn’t complete that action", isPresented: Binding(get: { model.errorMessage != nil }, set: { if !$0 { model.errorMessage = nil } })) {
            Button("OK", role: .cancel) { model.errorMessage = nil }
        } message: { Text(model.errorMessage ?? "") }
        .sheet(item: $sheet) { _ in
            NavigationStack {
                Form {
                    TextField("Puzzle URL", text: $pastedLink, axis: .vertical)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                    Button("Import puzzle") {
                        guard let url = URL(string: pastedLink) else { model.errorMessage = HostError.invalidLink.localizedDescription; return }
                        sheet = nil
                        model.importURL(url)
                    }
                    Text("Links import clues and name only. Your progress and photos stay on this device.").font(.footnote)
                }
                .navigationTitle("Import link")
                .toolbar { Button("Cancel") { sheet = nil } }
            }
        }
    }
}
