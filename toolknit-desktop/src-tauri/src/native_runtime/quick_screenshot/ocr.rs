use super::*;

#[cfg(windows)]
pub(super) fn recognize(bytes: Vec<u8>) -> Result<serde_json::Value, String> {
    use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};
    use windows::{
        Graphics::Imaging::{BitmapAlphaMode, BitmapPixelFormat, SoftwareBitmap},
        Media::Ocr::OcrEngine,
        Storage::Streams::DataWriter,
    };
    unsafe {
        RoInitialize(RO_INIT_MULTITHREADED).map_err(|_| "screenshot:ocr-unavailable")?;
    }
    struct Apartment;
    impl Drop for Apartment {
        fn drop(&mut self) {
            unsafe {
                RoUninitialize();
            }
        }
    }
    let _apartment = Apartment;
    let image = decode(&bytes)?.to_rgba8();
    let max = OcrEngine::MaxImageDimension().map_err(|_| "screenshot:ocr-unavailable")?;
    if image.width() > max || image.height() > max {
        return Err("screenshot:ocr-too-large".into());
    }
    let engine = OcrEngine::TryCreateFromUserProfileLanguages()
        .map_err(|_| "screenshot:ocr-language-missing")?;
    let mut bgra = image.into_raw();
    for p in bgra.chunks_exact_mut(4) {
        p.swap(0, 2);
    }
    let (width, height) = image_dimensions(&bytes)?;
    let writer = DataWriter::new().map_err(|_| "screenshot:ocr-unavailable")?;
    writer
        .WriteBytes(&bgra)
        .map_err(|_| "screenshot:ocr-failed")?;
    let buffer = writer.DetachBuffer().map_err(|_| "screenshot:ocr-failed")?;
    let bitmap = SoftwareBitmap::CreateCopyWithAlphaFromBuffer(
        &buffer,
        BitmapPixelFormat::Bgra8,
        width as i32,
        height as i32,
        BitmapAlphaMode::Ignore,
    )
    .map_err(|_| "screenshot:ocr-failed")?;
    let result = engine
        .RecognizeAsync(&bitmap)
        .and_then(|op| op.get())
        .map_err(|_| "screenshot:ocr-failed")?;
    let mut lines = Vec::new();
    for line in result.Lines().map_err(|_| "screenshot:ocr-failed")? {
        let mut left = f32::MAX;
        let mut top = f32::MAX;
        let mut right = 0f32;
        let mut bottom = 0f32;
        for word in line.Words().map_err(|_| "screenshot:ocr-failed")? {
            let r = word.BoundingRect().map_err(|_| "screenshot:ocr-failed")?;
            left = left.min(r.X);
            top = top.min(r.Y);
            right = right.max(r.X + r.Width);
            bottom = bottom.max(r.Y + r.Height);
        }
        if left.is_finite() && right > left && lines.len() < 2000 {
            lines.push(serde_json::json!({"id": lines.len(), "text": line.Text().map_err(|_| "screenshot:ocr-failed")?.to_string(), "x": left, "y": top, "width": right-left, "height": bottom-top}));
        }
    }
    let _ = bitmap.Close();
    Ok(
        serde_json::json!({"text": result.Text().map_err(|_| "screenshot:ocr-failed")?.to_string(), "lines": lines, "width":width, "height":height}),
    )
}

#[cfg(not(windows))]
pub(super) fn recognize(_bytes: Vec<u8>) -> Result<serde_json::Value, String> {
    Err("screenshot:windows-only".into())
}
