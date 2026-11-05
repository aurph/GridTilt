// Re-encodes a silent clip to H.264 at a set size and average bitrate, fast start, no audio.
//   encode-clip <source.mp4> <output.mp4> <width> <height> <bits-per-second>
import AVFoundation
import Foundation

let a = CommandLine.arguments
guard a.count == 6, let w = Int(a[3]), let h = Int(a[4]), let bps = Int(a[5]) else {
  print("usage: encode-clip <source> <output> <width> <height> <bits-per-second>"); exit(2)
}
let src = URL(fileURLWithPath: a[1]), dst = URL(fileURLWithPath: a[2])
try? FileManager.default.removeItem(at: dst)

let asset = AVURLAsset(url: src)
guard let track = asset.tracks(withMediaType: .video).first else { print("no video track"); exit(1) }

let reader = try AVAssetReader(asset: asset)
let output = AVAssetReaderTrackOutput(track: track, outputSettings: [
  kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
  kCVPixelBufferWidthKey as String: w,
  kCVPixelBufferHeightKey as String: h,
])
output.alwaysCopiesSampleData = false
reader.add(output)

let writer = try AVAssetWriter(outputURL: dst, fileType: .mp4)
writer.shouldOptimizeForNetworkUse = true
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
  AVVideoCodecKey: AVVideoCodecType.h264,
  AVVideoWidthKey: w,
  AVVideoHeightKey: h,
  AVVideoCompressionPropertiesKey: [
    AVVideoAverageBitRateKey: bps,
    AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
    AVVideoMaxKeyFrameIntervalKey: 48,
  ] as [String: Any],
])
input.expectsMediaDataInRealTime = false
writer.add(input)

guard reader.startReading(), writer.startWriting() else {
  print("start failed: \(String(describing: reader.error ?? writer.error))"); exit(1)
}
writer.startSession(atSourceTime: .zero)

let done = DispatchSemaphore(value: 0)
input.requestMediaDataWhenReady(on: DispatchQueue(label: "encode")) {
  while input.isReadyForMoreMediaData {
    if let s = output.copyNextSampleBuffer() {
      if !input.append(s) { print("append failed: \(String(describing: writer.error))"); exit(1) }
    } else {
      input.markAsFinished()
      done.signal()
      return
    }
  }
}
done.wait()
let finished = DispatchSemaphore(value: 0)
writer.finishWriting { finished.signal() }
finished.wait()
if writer.status != .completed { print("write failed: \(String(describing: writer.error))"); exit(1) }
print("wrote \(dst.lastPathComponent)")
