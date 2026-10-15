// Product-level limits mirrored by the frontend for native export validation.
// The generic file reader keeps its larger runtime safety ceiling separately.
pub(super) const MARKDOWN_MAX_DOCUMENT_BYTES: usize = 20 * 1024 * 1024;
pub(super) const MARKDOWN_MAX_ASSETS: usize = 20;
pub(super) const MARKDOWN_MAX_ASSET_BYTES: usize = 15 * 1024 * 1024;
pub(super) const MARKDOWN_MAX_TOTAL_ASSET_BYTES: usize = 40 * 1024 * 1024;
