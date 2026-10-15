use super::*;

fn prepare(image: image::RgbaImage, max: u32) -> image::RgbaImage {
    let longest = image.width().max(image.height());
    let scale = if longest <= 1600 {
        2.0_f64.min(max as f64 / longest as f64)
    } else {
        1.0_f64.min(max as f64 / longest as f64)
    };
    let mut image = if (scale - 1.0).abs() > f64::EPSILON {
        image::imageops::resize(
            &image,
            ((image.width() as f64 * scale).round() as u32).max(1),
            ((image.height() as f64 * scale).round() as u32).max(1),
            image::imageops::FilterType::CatmullRom,
        )
    } else {
        image
    };
    let dark = image
        .pixels()
        .filter(|p| u32::from(p[0]) * 299 + u32::from(p[1]) * 587 + u32::from(p[2]) * 114 < 100_000)
        .count()
        > image.len() / 4 / 2;
    for p in image.pixels_mut() {
        let gray =
            ((u32::from(p[0]) * 299 + u32::from(p[1]) * 587 + u32::from(p[2]) * 114) / 1000) as u8;
        let gray = if dark { 255 - gray } else { gray };
        *p = image::Rgba([gray, gray, gray, 255]);
    }
    image
}

#[cfg(test)]
pub(super) fn recognize(bytes: Vec<u8>) -> Result<serde_json::Value, String> {
    recognize_with_language(bytes, None)
}

#[cfg(windows)]
pub(super) fn recognize_with_language(
    bytes: Vec<u8>,
    language: Option<String>,
) -> Result<serde_json::Value, String> {
    use windows::Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED};
    use windows::{
        Globalization::Language,
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
    let original = decode(&bytes)?.to_rgba8();
    let (width, height) = original.dimensions();
    let max = OcrEngine::MaxImageDimension().map_err(|_| "screenshot:ocr-unavailable")?;
    let image = prepare(original, max);
    let (ocr_width, ocr_height) = image.dimensions();
    let sx = width as f32 / ocr_width as f32;
    let sy = height as f32 / ocr_height as f32;
    let preferred = match language.as_deref() {
        Some("zh") => Some("zh-Hans"),
        Some("en") => Some("en-US"),
        _ => None,
    };
    let engine = preferred
        .and_then(|tag| {
            Language::CreateLanguage(&windows::core::HSTRING::from(tag))
                .ok()
                .and_then(|language| OcrEngine::TryCreateFromLanguage(&language).ok())
        })
        .or_else(|| OcrEngine::TryCreateFromUserProfileLanguages().ok())
        .ok_or("screenshot:ocr-language-missing")?;
    let mut bgra = image.into_raw();
    for p in bgra.chunks_exact_mut(4) {
        p.swap(0, 2);
    }
    let writer = DataWriter::new().map_err(|_| "screenshot:ocr-unavailable")?;
    writer
        .WriteBytes(&bgra)
        .map_err(|_| "screenshot:ocr-failed")?;
    let buffer = writer.DetachBuffer().map_err(|_| "screenshot:ocr-failed")?;
    let bitmap = SoftwareBitmap::CreateCopyWithAlphaFromBuffer(
        &buffer,
        BitmapPixelFormat::Bgra8,
        ocr_width as i32,
        ocr_height as i32,
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
        let mut words = Vec::new();
        for word in line.Words().map_err(|_| "screenshot:ocr-failed")? {
            let r = word.BoundingRect().map_err(|_| "screenshot:ocr-failed")?;
            words.push(serde_json::json!({"text":word.Text().map_err(|_| "screenshot:ocr-failed")?.to_string(),"x":r.X*sx,"y":r.Y*sy,"width":r.Width*sx,"height":r.Height*sy}));
            left = left.min(r.X);
            top = top.min(r.Y);
            right = right.max(r.X + r.Width);
            bottom = bottom.max(r.Y + r.Height);
        }
        if left.is_finite() && right > left && lines.len() < 2000 {
            lines.push(serde_json::json!({"id": lines.len(), "text": line.Text().map_err(|_| "screenshot:ocr-failed")?.to_string(), "x": left*sx, "y": top*sy, "width": (right-left)*sx, "height": (bottom-top)*sy, "words":words}));
        }
    }
    let _ = bitmap.Close();
    Ok(
        serde_json::json!({"text": result.Text().map_err(|_| "screenshot:ocr-failed")?.to_string(), "lines": lines, "width":width, "height":height}),
    )
}

#[cfg(not(windows))]
pub(super) fn recognize_with_language(
    _bytes: Vec<u8>,
    _language: Option<String>,
) -> Result<serde_json::Value, String> {
    Err("screenshot:windows-only".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[cfg(windows)]
    #[test]
    #[ignore = "Requires Windows OCR and synthetic fixtures"]
    fn screenshot_native_ocr_matrix() {
        let directory = std::env::var("TOOLKNIT_SCREENSHOT_OCR_MATRIX").unwrap();
        for name in ["light", "dark", "small", "large"] {
            let bytes = std::fs::read(std::path::Path::new(&directory).join(format!("{name}.png")))
                .unwrap();
            let start = std::time::Instant::now();
            let result = recognize_with_language(bytes, Some("zh".into())).unwrap();
            let text = result["text"].as_str().unwrap();
            assert!(
                text.to_uppercase().contains("SCREENSHOT") && text.to_uppercase().contains("TEST"),
                "Missing English words in {name}"
            );
            let cjk_hits = "中文内容提取测试"
                .chars()
                .filter(|ch| text.contains(*ch))
                .count();
            assert!(cjk_hits >= 6, "Missing Chinese words in {name}");
            let width = result["width"].as_f64().unwrap();
            let height = result["height"].as_f64().unwrap();
            let lines = result["lines"].as_array().unwrap();
            assert!(lines.iter().all(|line| line["words"]
                .as_array()
                .is_some_and(|words| !words.is_empty())
                && line["x"].as_f64().unwrap() + line["width"].as_f64().unwrap() <= width + 1.0
                && line["y"].as_f64().unwrap() + line["height"].as_f64().unwrap() <= height + 1.0));
            println!(
                "OCR {name}: {} ms, {} lines, CJK {cjk_hits}/8",
                start.elapsed().as_millis(),
                lines.len()
            );
        }
    }
    #[test]
    fn preprocessing_is_bounded_and_normalizes_dark_backgrounds() {
        let dark = prepare(
            image::RgbaImage::from_pixel(400, 200, image::Rgba([20, 20, 20, 255])),
            2048,
        );
        assert_eq!(dark.dimensions(), (800, 400));
        assert_eq!(dark.get_pixel(0, 0)[0], 235);
        let large = prepare(
            image::RgbaImage::from_pixel(3000, 1000, image::Rgba([255, 255, 255, 255])),
            2048,
        );
        assert_eq!(large.dimensions(), (2048, 683));
        assert_eq!(large.get_pixel(0, 0)[0], 255);
    }
}
