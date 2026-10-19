import Foundation

struct PhotoStore {
    let directory: URL

    init(directory: URL) throws {
        self.directory = directory
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    }

    func stage(_ data: Data) throws -> String {
        let name = UUID().uuidString + ".jpg"
        try data.write(to: directory.appendingPathComponent(name), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
        return name
    }

    func read(_ name: String?) throws -> Data? {
        guard let name else { return nil }
        return try Data(contentsOf: directory.appendingPathComponent(name))
    }

    // Only call after metadata commit. Failed removals remain eligible on next launch.
    func clean(referenced: Set<String>) throws {
        for url in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil) {
            guard !referenced.contains(url.lastPathComponent) else { continue }
            try FileManager.default.removeItem(at: url)
        }
    }
}
