import AppKit

let directory = CommandLine.arguments[1]
let image = NSImage(size: NSSize(width: 1024, height: 1024), flipped: false) { _ in
    let bounds = NSRect(x: 68, y: 68, width: 888, height: 888)
    NSColor(calibratedRed: 0.07, green: 0.08, blue: 0.11, alpha: 1).setFill()
    NSBezierPath(roundedRect: bounds, xRadius: 200, yRadius: 200).fill()
    let halo = NSBezierPath(ovalIn: NSRect(x: 221, y: 221, width: 582, height: 582))
    NSColor(calibratedRed: 0.51, green: 0.55, blue: 0.97, alpha: 1).setStroke()
    halo.lineWidth = 42; halo.stroke()
    let inner = NSBezierPath(ovalIn: NSRect(x: 289, y: 289, width: 446, height: 446))
    NSColor(calibratedRed: 0.51, green: 0.55, blue: 0.97, alpha: 0.15).setFill(); inner.fill()
    let check = NSBezierPath(); check.move(to: NSPoint(x: 372, y: 510)); check.line(to: NSPoint(x: 470, y: 413)); check.line(to: NSPoint(x: 664, y: 611))
    NSColor(calibratedRed: 0.40, green: 0.86, blue: 0.73, alpha: 1).setStroke()
    check.lineWidth = 48; check.lineCapStyle = .round; check.lineJoinStyle = .round; check.stroke()
    return true
}
for size in [16, 32, 128, 256, 512] {
    for scale in [1, 2] {
        let pixels = size * scale
        let rep = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: pixels, pixelsHigh: pixels, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
        NSGraphicsContext.saveGraphicsState(); NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: rep)
        image.draw(in: NSRect(x: 0, y: 0, width: pixels, height: pixels))
        NSGraphicsContext.restoreGraphicsState()
        let filename = "icon_\(size)x\(size)\(scale == 2 ? "@2x" : "").png"
        try rep.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: directory).appendingPathComponent(filename))
    }
}
