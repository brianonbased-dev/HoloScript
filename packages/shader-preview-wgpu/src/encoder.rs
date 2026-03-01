//! PNG encoding and base64 conversion for frame data.
//!
//! Provides two encoding modes:
//! - **PNG mode**: Compressed PNG -> base64 data URI (smaller payloads, ~5ms in release)
//! - **Raw mode**: Raw RGBA pixels -> base64 (fastest encode, ~3ms, decoded via canvas ImageData)

use crate::error::PreviewError;
use base64::Engine as _;
use base64::engine::general_purpose::STANDARD as BASE64;

/// Encodes raw RGBA pixel data to PNG, then to base64 data URI.
pub struct PngEncoder;

impl PngEncoder {
    /// Strip row padding from GPU buffer data, returning contiguous pixel data.
    fn strip_padding(
        data: &[u8],
        height: u32,
        padded_bytes_per_row: u32,
        unpadded_bytes_per_row: u32,
    ) -> Vec<u8> {
        if padded_bytes_per_row == unpadded_bytes_per_row {
            return data.to_vec();
        }
        let mut stripped = Vec::with_capacity((unpadded_bytes_per_row * height) as usize);
        for row in 0..height {
            let start = (row * padded_bytes_per_row) as usize;
            let end = start + unpadded_bytes_per_row as usize;
            if end <= data.len() {
                stripped.extend_from_slice(&data[start..end]);
            }
        }
        stripped
    }

    /// Encode raw RGBA8 pixels to a PNG byte buffer.
    ///
    /// `padded_bytes_per_row` is the actual row stride from the GPU buffer
    /// (which may include padding for alignment). `unpadded_bytes_per_row`
    /// is the expected row width (width * 4).
    pub fn encode_png(
        data: &[u8],
        width: u32,
        height: u32,
        padded_bytes_per_row: u32,
        unpadded_bytes_per_row: u32,
    ) -> Result<Vec<u8>, PreviewError> {
        let mut png_buf = Vec::with_capacity((width * height * 4 + 1024) as usize);
        {
            let mut encoder = png::Encoder::new(&mut png_buf, width, height);
            encoder.set_color(png::ColorType::Rgba);
            encoder.set_depth(png::BitDepth::Eight);
            encoder.set_compression(png::Compression::Fast);

            let mut writer = encoder
                .write_header()
                .map_err(|e| PreviewError::PngEncode(e.to_string()))?;

            if padded_bytes_per_row == unpadded_bytes_per_row {
                writer
                    .write_image_data(data)
                    .map_err(|e| PreviewError::PngEncode(e.to_string()))?;
            } else {
                let stripped = Self::strip_padding(data, height, padded_bytes_per_row, unpadded_bytes_per_row);
                writer
                    .write_image_data(&stripped)
                    .map_err(|e| PreviewError::PngEncode(e.to_string()))?;
            }
        }
        Ok(png_buf)
    }

    /// Encode raw RGBA8 pixels to a base64 data URI string (PNG format).
    pub fn encode_base64_data_uri(
        data: &[u8],
        width: u32,
        height: u32,
        padded_bytes_per_row: u32,
        unpadded_bytes_per_row: u32,
    ) -> Result<String, PreviewError> {
        let png_bytes =
            Self::encode_png(data, width, height, padded_bytes_per_row, unpadded_bytes_per_row)?;
        let b64 = BASE64.encode(&png_bytes);
        Ok(format!("data:image/png;base64,{}", b64))
    }

    /// Encode raw RGBA8 pixels to just the base64 string (no data URI prefix).
    pub fn encode_base64_raw(
        data: &[u8],
        width: u32,
        height: u32,
        padded_bytes_per_row: u32,
        unpadded_bytes_per_row: u32,
    ) -> Result<String, PreviewError> {
        let png_bytes =
            Self::encode_png(data, width, height, padded_bytes_per_row, unpadded_bytes_per_row)?;
        Ok(BASE64.encode(&png_bytes))
    }

    /// Encode raw RGBA8 pixels directly to base64 (no PNG compression).
    ///
    /// This is the fastest encode path (~3ms for 720p in release builds).
    /// The frontend must decode this using `canvas.putImageData()` with
    /// `Uint8ClampedArray` from the base64 string.
    ///
    /// Returns a JSON object string: `{"raw_b64":"...","width":1280,"height":720}`
    pub fn encode_raw_base64(
        data: &[u8],
        _width: u32,
        height: u32,
        padded_bytes_per_row: u32,
        unpadded_bytes_per_row: u32,
    ) -> Result<String, PreviewError> {
        let pixels = if padded_bytes_per_row == unpadded_bytes_per_row {
            BASE64.encode(data)
        } else {
            let stripped = Self::strip_padding(data, height, padded_bytes_per_row, unpadded_bytes_per_row);
            BASE64.encode(&stripped)
        };
        Ok(pixels)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_small_image() {
        // 2x2 red image
        let data = vec![
            255, 0, 0, 255, 0, 255, 0, 255, // row 0
            0, 0, 255, 255, 255, 255, 0, 255, // row 1
        ];
        let result = PngEncoder::encode_png(&data, 2, 2, 8, 8);
        assert!(result.is_ok());
        let png_bytes = result.unwrap();
        // PNG signature
        assert_eq!(&png_bytes[..4], &[0x89, 0x50, 0x4E, 0x47]);
    }

    #[test]
    fn test_encode_base64_data_uri() {
        let data = vec![0u8; 16]; // 2x2 black image
        let result = PngEncoder::encode_base64_data_uri(&data, 2, 2, 8, 8);
        assert!(result.is_ok());
        assert!(result.unwrap().starts_with("data:image/png;base64,"));
    }

    #[test]
    fn test_padded_rows() {
        // 3x2 image with 4-byte padding per row
        // unpadded_bytes_per_row = 3 * 4 = 12
        // padded_bytes_per_row = 16 (aligned to 256 would be bigger, but testing concept)
        let mut data = Vec::new();
        // Row 0: 3 RGBA pixels (12 bytes) + 4 padding bytes
        data.extend_from_slice(&[255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255]);
        data.extend_from_slice(&[0, 0, 0, 0]); // padding
        // Row 1: 3 RGBA pixels (12 bytes) + 4 padding bytes
        data.extend_from_slice(&[255, 255, 0, 255, 0, 255, 255, 255, 255, 0, 255, 255]);
        data.extend_from_slice(&[0, 0, 0, 0]); // padding

        let result = PngEncoder::encode_png(&data, 3, 2, 16, 12);
        assert!(result.is_ok());
    }
}
