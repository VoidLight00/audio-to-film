import Foundation
import Vision
import AppKit
let dir = CommandLine.arguments[1]
let fm = FileManager.default
let files = try! fm.contentsOfDirectory(atPath: dir).filter { $0.hasSuffix(".jpg") }.sorted()
var out: [[String: Any]] = []
for f in files {
    let url = URL(fileURLWithPath: dir + "/" + f)
    guard let img = NSImage(contentsOf: url), let cg = img.cgImage(forProposedRect: nil, context: nil, hints: nil) else { continue }
    let req = VNRecognizeTextRequest()
    req.recognitionLevel = .accurate
    req.usesLanguageCorrection = false
    req.minimumTextHeight = 0.008
    if CommandLine.arguments.count > 3 { req.recognitionLanguages = CommandLine.arguments[3].components(separatedBy: ",") }
    let h = VNImageRequestHandler(cgImage: cg, options: [:])
    try? h.perform([req])
    var items: [[String: Any]] = []
    for o in (req.results ?? []) {
        guard let c = o.topCandidates(1).first else { continue }
        let b = o.boundingBox
        items.append(["t": c.string, "c": c.confidence, "x": b.origin.x, "y": b.origin.y, "w": b.size.width, "h": b.size.height])
    }
    out.append(["f": f, "items": items])
}
let data = try! JSONSerialization.data(withJSONObject: out, options: [])
FileManager.default.createFile(atPath: CommandLine.arguments[2], contents: data)
print("done", out.count)
