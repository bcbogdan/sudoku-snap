import Foundation

struct ShareParameters: Sendable {
    var encoded: String
    var name: String?

    init(url: URL) throws {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              ["https", "http", "sudokusnap"].contains(components.scheme?.lowercased() ?? ""),
              let items = components.queryItems,
              items.filter({ $0.name == "p" }).count == 1,
              items.filter({ $0.name == "n" }).count <= 1,
              let encoded = items.first(where: { $0.name == "p" })?.value, !encoded.isEmpty else {
            throw HostError.invalidLink
        }
        self.encoded = encoded
        self.name = items.first(where: { $0.name == "n" })?.value
    }

    static func url(encoded: String, name: String) throws -> URL {
        // No web hosting origin has been configured. This is an app link, not a Universal Link.
        var components = URLComponents()
        components.scheme = "sudokusnap"
        components.host = "import"
        components.queryItems = [URLQueryItem(name: "p", value: encoded), URLQueryItem(name: "n", value: name)]
        guard let url = components.url else { throw HostError.invalidLink }
        return url
    }
}
