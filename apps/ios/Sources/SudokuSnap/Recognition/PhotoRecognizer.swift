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
}

actor PhotoRecognizer {
    func recognize(_ data: Data) throws -> Recognition {
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
        let input = CIImage(cgImage: image)
        func vector(_ point: CGPoint) -> CIVector {
            CIVector(x: point.x * CGFloat(image.width), y: point.y * CGFloat(image.height))
        }
        var corrected = input.applyingFilter("CIPerspectiveCorrection", parameters: [
            "inputTopLeft": vector(rectangle.topLeft), "inputTopRight": vector(rectangle.topRight),
            "inputBottomLeft": vector(rectangle.bottomLeft), "inputBottomRight": vector(rectangle.bottomRight)
        ])
        let average = corrected.applyingFilter("CIAreaAverage", parameters: [kCIInputExtentKey: CIVector(cgRect: corrected.extent)])
        var pixel = [UInt8](repeating: 0, count: 4)
        context.render(average, toBitmap: &pixel, rowBytes: 4, bounds: CGRect(x: 0, y: 0, width: 1, height: 1), format: .RGBA8, colorSpace: CGColorSpaceCreateDeviceRGB())
        if (Int(pixel[0]) + Int(pixel[1]) + Int(pixel[2])) / 3 < 110 {
            corrected = corrected.applyingFilter("CIColorInvert")
        }
        corrected = corrected.applyingFilter("CIColorControls", parameters: [kCIInputSaturationKey: 0, kCIInputContrastKey: 1.3])
        var clues = [UInt8](repeating: 0, count: 81)
        var uncertain: [UInt8] = []
        let bounds = corrected.extent
        for index in 0..<81 {
            try Task.checkCancellation()
            let width = bounds.width / 9
            let height = bounds.height / 9
            let cell = CGRect(x: bounds.minX + CGFloat(index % 9) * width,
                              y: bounds.minY + CGFloat(8 - index / 9) * height,
                              width: width, height: height).insetBy(dx: width * 0.12, dy: height * 0.12)
            guard let crop = context.createCGImage(corrected, from: cell) else { throw HostError.invalidPhoto }
            let request = VNRecognizeTextRequest()
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
            request.recognitionLanguages = ["en-US"]
            request.minimumTextHeight = 0.15
            try VNImageRequestHandler(cgImage: crop).perform([request])
            let candidates = request.results?.compactMap { $0.topCandidates(1).first } ?? []
            if candidates.count == 1, let text = candidates.first,
               text.string.count == 1, let digit = UInt8(text.string), (1...9).contains(digit) {
                clues[index] = digit
                if text.confidence < 0.85 { uncertain.append(UInt8(index)) }
            } else {
                // Vision cannot distinguish an empty cell from a missed digit reliably.
                uncertain.append(UInt8(index))
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
                           diagnostic: "Review every clue against the source photo. Uncertain cells include blanks that Vision could not verify.")
    }
}
