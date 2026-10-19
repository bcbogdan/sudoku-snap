import CoreImage
import Foundation
import ImageIO
import UniformTypeIdentifiers
import Vision

struct Recognition: Sendable {
    var clues: [UInt8]
    var uncertain: [UInt8]
    var sourceJPEG: Data
    var diagnostic: String
    var evidence: RecognitionEvidence? = nil
}

struct RecognitionEvidence: Sendable {
    var geometry: String
    var cells: [String] = []
    var images: [String: Data] = [:]
}

actor PhotoRecognizer {
    func recognize(_ data: Data, collectEvidence: Bool = false) throws -> Recognition {
        try Task.checkCancellation()
        guard data.count <= 40_000_000,
              let source = CGImageSourceCreateWithData(data as CFData, nil),
              let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [
                kCGImageSourceCreateThumbnailFromImageAlways: true,
                kCGImageSourceCreateThumbnailWithTransform: true,
                kCGImageSourceThumbnailMaxPixelSize: 2_048
              ] as CFDictionary) else { throw HostError.invalidPhoto }

        let rectangles = VNDetectRectanglesRequest()
        rectangles.maximumObservations = 8
        rectangles.minimumAspectRatio = 0.65
        rectangles.maximumAspectRatio = 1
        rectangles.minimumSize = 0.2
        rectangles.quadratureTolerance = 35
        try VNImageRequestHandler(cgImage: image).perform([rectangles])
        try Task.checkCancellation()
        guard let rectangle = rectangles.results?.max(by: {
            $0.boundingBox.width * $0.boundingBox.height < $1.boundingBox.width * $1.boundingBox.height
        }) else { throw HostError.noGrid }

        let context = CIContext()
        defer { context.clearCaches() }
        let input = CIImage(cgImage: image)
        func vector(_ point: CGPoint) -> CIVector {
            CIVector(x: point.x * CGFloat(image.width), y: point.y * CGFloat(image.height))
        }
        let corrected = input.applyingFilter("CIPerspectiveCorrection", parameters: [
            "inputTopLeft": vector(rectangle.topLeft), "inputTopRight": vector(rectangle.topRight),
            "inputBottomLeft": vector(rectangle.bottomLeft), "inputBottomRight": vector(rectangle.bottomRight)
        ])
        let normalized = corrected.transformed(by: CGAffineTransform(
            translationX: -corrected.extent.minX, y: -corrected.extent.minY
        )).transformed(by: CGAffineTransform(scaleX: 900 / corrected.extent.width,
                                            y: 900 / corrected.extent.height))
        guard let flat = context.createCGImage(normalized, from: CGRect(x: 0, y: 0, width: 900, height: 900)) else {
            throw HostError.invalidPhoto
        }
        var gray = try grayscale(flat)
        // Median background is less sensitive than the mean to highlights and grid lines.
        let dark = gray.lazy.filter { $0 < 128 }.count > gray.count / 2
        if dark { gray = gray.map { 255 - $0 } }
        let ink = try adaptiveInk(gray, side: 900)
        var evidence: RecognitionEvidence? = collectEvidence ? RecognitionEvidence(
            geometry: "source=\(image.width)x\(image.height) candidates=\(rectangles.results?.map(\.boundingBox) ?? []) rectangle=\(rectangle.boundingBox) TL=\(rectangle.topLeft) TR=\(rectangle.topRight) BL=\(rectangle.bottomLeft) BR=\(rectangle.bottomRight) corrected=\(corrected.extent) inverted=\(dark)"
        ) : nil
        if collectEvidence {
            evidence?.images["rectified.png"] = try png(flat)
            evidence?.images["normalized.png"] = try png(grayImage(gray, width: 900, height: 900))
            evidence?.images["ink.png"] = try png(grayImage(ink.map { $0 ? 0 : 255 }, width: 900, height: 900))
        }
        var clues = [UInt8](repeating: 0, count: 81)
        var uncertain: [UInt8] = []
        for index in 0..<81 {
            try Task.checkCancellation()
            try autoreleasepool {
                let x = index % 9 * 100 + 10
                let y = index / 9 * 100 + 10
                let cell = CGRect(x: x, y: y, width: 80, height: 80)
                if collectEvidence {
                    let pixels = cropPixels(gray, x: x, y: y, width: 80, height: 80)
                    evidence?.images["cell-\(index)-crop.png"] = try png(grayImage(pixels, width: 80, height: 80))
                }
                guard let glyph = component(in: ink, x: x, y: y) else {
                    // Absence of a component is not proof that a photographed cell is blank.
                    uncertain.append(UInt8(index))
                    evidence?.cells.append("cell=\(index) rect(top-left)=\(cell) glyph=none recognized=0 confidence=none")
                    return
                }
                let mask = try glyphImage(glyph, gray: gray, x: x, y: y, binary: true)
                let tone = try glyphImage(glyph, gray: gray, x: x, y: y, binary: false)
                // Different recognition levels provide a second check on correlated accurate-pass errors.
                let readings = [try readDigit(mask, label: "mask", level: .accurate),
                                try readDigit(tone, label: "tone", level: .accurate),
                                try readDigit(mask, label: "mask", level: .fast)]
                let votes = Dictionary(grouping: readings.compactMap { $0.digit }, by: { $0 })
                let winner = votes.keys.sorted { left, right in
                    if votes[left]!.count != votes[right]!.count { return votes[left]!.count > votes[right]!.count }
                    let leftConfidence = readings.filter { $0.digit == left }.map(\.confidence).max() ?? 0
                    let rightConfidence = readings.filter { $0.digit == right }.map(\.confidence).max() ?? 0
                    return leftConfidence == rightConfidence ? left < right : leftConfidence > rightConfidence
                }.first
                clues[index] = winner ?? 0
                let agreeing = readings.filter { $0.digit == winner && winner != nil }
                if agreeing.count < 2 || agreeing.count != readings.count || agreeing.contains(where: { $0.confidence < 0.85 }) {
                    uncertain.append(UInt8(index))
                }
                if collectEvidence {
                    evidence?.images["cell-\(index)-mask.png"] = try png(mask)
                    evidence?.images["cell-\(index)-tone.png"] = try png(tone)
                    evidence?.cells.append("cell=\(index) rect(top-left)=\(cell) glyph=\(glyph.bounds) area=\(glyph.pixels.count) recognized=\(clues[index]) passes=\(readings.map(\.description))")
                }
            }
        }
        try Task.checkCancellation()
        let output = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(output as CFMutableData, UTType.jpeg.identifier as CFString, 1, nil) else {
            throw HostError.invalidPhoto
        }
        CGImageDestinationAddImage(destination, image, [kCGImageDestinationLossyCompressionQuality: 0.85] as CFDictionary)
        guard CGImageDestinationFinalize(destination) else { throw HostError.invalidPhoto }
        return Recognition(clues: clues, uncertain: uncertain, sourceJPEG: output as Data,
                           diagnostic: "Review every clue against the source photo. Uncertain cells include blanks that Vision could not verify.", evidence: evidence)
    }

    private struct Reading {
        var digit: UInt8?
        var confidence: Float
        var description: String
    }

    private func readDigit(_ image: CGImage, label: String, level: VNRequestTextRecognitionLevel) throws -> Reading {
        try Task.checkCancellation()
        let request = VNRecognizeTextRequest()
        request.recognitionLevel = level
        request.usesLanguageCorrection = false
        request.recognitionLanguages = ["en-US"]
        request.minimumTextHeight = 0.15
        try VNImageRequestHandler(cgImage: image).perform([request])
        let observations = request.results ?? []
        let candidates = observations.flatMap { $0.topCandidates(3) }
        let best = observations.count == 1 ? observations.first?.topCandidates(1).first : nil
        let digit = best.flatMap { text -> UInt8? in
            let value = text.string.trimmingCharacters(in: .whitespacesAndNewlines)
            guard value.count == 1, let number = UInt8(value), (1...9).contains(number) else { return nil }
            return number
        }
        // Do not turn letters into clues: a confident 'S' is not evidence of a five.
        return Reading(digit: digit, confidence: best?.confidence ?? 0,
                       description: "\(label)-\(level == .accurate ? "accurate" : "fast") candidates=\(candidates.map { "\($0.string):\($0.confidence)" }) boxes=\(observations.map(\.boundingBox))")
    }

    private func grayscale(_ image: CGImage) throws -> [UInt8] {
        var pixels = [UInt8](repeating: 0, count: image.width * image.height)
        let drawn = pixels.withUnsafeMutableBytes { bytes -> Bool in
            guard let bitmap = CGContext(data: bytes.baseAddress, width: image.width, height: image.height,
                                         bitsPerComponent: 8, bytesPerRow: image.width,
                                         space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else { return false }
            bitmap.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
            return true
        }
        guard drawn else { throw HostError.invalidPhoto }
        return pixels
    }

    private func grayImage(_ pixels: [UInt8], width: Int, height: Int) throws -> CGImage {
        guard let provider = CGDataProvider(data: Data(pixels) as CFData),
              let image = CGImage(width: width, height: height, bitsPerComponent: 8, bitsPerPixel: 8,
                                  bytesPerRow: width, space: CGColorSpaceCreateDeviceGray(),
                                  bitmapInfo: CGBitmapInfo(rawValue: CGImageAlphaInfo.none.rawValue),
                                  provider: provider, decode: nil, shouldInterpolate: true, intent: .defaultIntent) else {
            throw HostError.invalidPhoto
        }
        return image
    }

    private func png(_ image: CGImage) throws -> Data {
        let data = NSMutableData()
        guard let destination = CGImageDestinationCreateWithData(data as CFMutableData, UTType.png.identifier as CFString, 1, nil) else {
            throw HostError.invalidPhoto
        }
        CGImageDestinationAddImage(destination, image, nil)
        guard CGImageDestinationFinalize(destination) else { throw HostError.invalidPhoto }
        return data as Data
    }

    private func adaptiveInk(_ gray: [UInt8], side: Int) throws -> [Bool] {
        // Same 31px Gaussian neighborhood and 12-level offset as the web extractor.
        let weights = (-15...15).map { exp(-Double($0 * $0) / 50) }
        let total = weights.reduce(0, +)
        let kernel = weights.map { Float($0 / total) }
        var horizontal = [Float](repeating: 0, count: gray.count)
        for y in 0..<side {
            try Task.checkCancellation()
            for x in 0..<side {
                var sum: Float = 0
                for k in -15...15 { sum += Float(gray[y * side + min(side - 1, max(0, x + k))]) * kernel[k + 15] }
                horizontal[y * side + x] = sum
            }
        }
        var ink = [Bool](repeating: false, count: gray.count)
        for y in 0..<side {
            try Task.checkCancellation()
            for x in 0..<side {
                var sum: Float = 0
                for k in -15...15 { sum += horizontal[min(side - 1, max(0, y + k)) * side + x] * kernel[k + 15] }
                ink[y * side + x] = Float(gray[y * side + x]) < sum - 12
            }
        }
        return ink
    }

    private struct Glyph {
        var bounds: CGRect
        var pixels: [Int]
    }

    private func component(in ink: [Bool], x: Int, y: Int) -> Glyph? {
        var visited = [Bool](repeating: false, count: 80 * 80)
        var best: Glyph?
        for seed in 0..<visited.count {
            guard !visited[seed], ink[(y + seed / 80) * 900 + x + seed % 80] else { continue }
            visited[seed] = true
            var pixels = [seed]
            var cursor = 0
            var minX = seed % 80, maxX = minX, minY = seed / 80, maxY = minY
            while cursor < pixels.count {
                let point = pixels[cursor]
                cursor += 1
                let px = point % 80, py = point / 80
                minX = min(minX, px); maxX = max(maxX, px)
                minY = min(minY, py); maxY = max(maxY, py)
                for ny in max(0, py - 1)...min(79, py + 1) {
                    for nx in max(0, px - 1)...min(79, px + 1) {
                        let next = ny * 80 + nx
                        if !visited[next], ink[(y + ny) * 900 + x + nx] {
                            visited[next] = true
                            pixels.append(next)
                        }
                    }
                }
            }
            let width = maxX - minX + 1, height = maxY - minY + 1
            guard minX > 1, minY > 1, maxX < 78, maxY < 78,
                  height >= 22, width >= 5, pixels.count >= 65,
                  abs(Double(minX) + Double(width) / 2 - 40) <= 22,
                  abs(Double(minY) + Double(height) / 2 - 40) <= 22,
                  pixels.count > (best?.pixels.count ?? 0) else { continue }
            best = Glyph(bounds: CGRect(x: minX, y: minY, width: width, height: height), pixels: pixels)
        }
        return best
    }

    private func cropPixels(_ gray: [UInt8], x: Int, y: Int, width: Int, height: Int) -> [UInt8] {
        var pixels: [UInt8] = []
        pixels.reserveCapacity(width * height)
        for row in 0..<height {
            let start: Int = (y + row) * 900 + x
            let end: Int = start + width
            pixels.append(contentsOf: gray[start..<end])
        }
        return pixels
    }

    private func glyphImage(_ glyph: Glyph, gray: [UInt8], x: Int, y: Int, binary: Bool) throws -> CGImage {
        let width = Int(glyph.bounds.width), height = Int(glyph.bounds.height)
        let minX = Int(glyph.bounds.minX), minY = Int(glyph.bounds.minY)
        var pixels = [UInt8](repeating: 255, count: width * height)
        if binary {
            for point in glyph.pixels { pixels[(point / 80 - minY) * width + point % 80 - minX] = 0 }
        } else {
            // Stretch each glyph locally; colored selection backgrounds no longer reduce contrast.
            let values = cropPixels(gray, x: x + minX, y: y + minY, width: width, height: height)
            let low: Int = Int(values.min() ?? 0)
            let high: Int = Int(values.max() ?? 255)
            let range: Int = max(1, high - low)
            for (index, value) in values.enumerated() {
                let scaled: Int = (Int(value) - low) * 255 / range
                pixels[index] = UInt8(scaled)
            }
        }
        let image = try grayImage(pixels, width: width, height: height)
        guard let canvas = CGContext(data: nil, width: 224, height: 224, bitsPerComponent: 8, bytesPerRow: 224,
                                     space: CGColorSpaceCreateDeviceGray(), bitmapInfo: CGImageAlphaInfo.none.rawValue) else {
            throw HostError.invalidPhoto
        }
        canvas.setFillColor(gray: 1, alpha: 1)
        canvas.fill(CGRect(x: 0, y: 0, width: 224, height: 224))
        canvas.interpolationQuality = .high
        let scale = 154 / CGFloat(max(width, height))
        let size = CGSize(width: CGFloat(width) * scale, height: CGFloat(height) * scale)
        canvas.draw(image, in: CGRect(x: (224 - size.width) / 2, y: (224 - size.height) / 2, width: size.width, height: size.height))
        guard let result = canvas.makeImage() else { throw HostError.invalidPhoto }
        return result
    }
}
