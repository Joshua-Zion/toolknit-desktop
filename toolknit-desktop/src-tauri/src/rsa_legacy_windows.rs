use zeroize::{Zeroize, Zeroizing};

#[derive(serde::Deserialize)]
pub(crate) struct RsaLegacyKeyComponents {
    n: String,
    e: String,
    p: Option<String>,
    q: Option<String>,
}

impl Drop for RsaLegacyKeyComponents {
    fn drop(&mut self) {
        self.n.zeroize();
        self.e.zeroize();
        if let Some(value) = self.p.as_mut() {
            value.zeroize();
        }
        if let Some(value) = self.q.as_mut() {
            value.zeroize();
        }
    }
}

#[cfg(target_os = "windows")]
fn decode_jwk_component(value: &str, error: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;

    if value.is_empty() || value.len() > 684 {
        return Err(error.to_string());
    }
    let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|_| error.to_string())?;
    if bytes.is_empty()
        || bytes[0] == 0
        || base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(&bytes) != value
    {
        return Err(error.to_string());
    }
    Ok(bytes)
}

#[cfg(target_os = "windows")]
fn decode_ciphertext(value: &str) -> Result<Vec<u8>, String> {
    use base64::Engine;

    if value.is_empty() || value.len() > 684 {
        return Err("crypto:rsa-ciphertext".to_string());
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(value)
        .map_err(|_| "crypto:rsa-ciphertext".to_string())?;
    if base64::engine::general_purpose::STANDARD.encode(&bytes) != value {
        return Err("crypto:rsa-ciphertext".to_string());
    }
    Ok(bytes)
}

#[cfg(target_os = "windows")]
fn cng_blob(
    key: &RsaLegacyKeyComponents,
    private: bool,
) -> Result<(Zeroizing<Vec<u8>>, usize), String> {
    use windows::Win32::Security::Cryptography::{BCRYPT_RSAPRIVATE_MAGIC, BCRYPT_RSAPUBLIC_MAGIC};

    let error = if private {
        "crypto:rsa-private-key"
    } else {
        "crypto:rsa-public-key"
    };
    if (!private && (key.p.is_some() || key.q.is_some()))
        || (private && (key.p.is_none() || key.q.is_none()))
    {
        return Err(error.to_string());
    }

    let modulus = Zeroizing::new(decode_jwk_component(&key.n, error)?);
    let exponent = Zeroizing::new(decode_jwk_component(&key.e, error)?);
    let modulus_len = modulus.len();
    if ![64, 128, 256, 512].contains(&modulus_len)
        || modulus[0] & 0x80 == 0
        || modulus[modulus_len - 1] & 1 == 0
        || exponent.len() > 8
    {
        return Err(error.to_string());
    }
    let exponent_value = exponent
        .iter()
        .fold(0_u64, |value, byte| (value << 8) | u64::from(*byte));
    if exponent_value < 3 || exponent_value & 1 == 0 {
        return Err(error.to_string());
    }

    let prime_len = modulus_len / 2;
    let mut prime_one = None;
    let mut prime_two = None;
    if private {
        let p = Zeroizing::new(decode_jwk_component(
            key.p.as_deref().ok_or_else(|| error.to_string())?,
            error,
        )?);
        let q = Zeroizing::new(decode_jwk_component(
            key.q.as_deref().ok_or_else(|| error.to_string())?,
            error,
        )?);
        if p.len() > prime_len
            || q.len() > prime_len
            || p[p.len() - 1] & 1 == 0
            || q[q.len() - 1] & 1 == 0
        {
            return Err(error.to_string());
        }
        let mut padded_p = Zeroizing::new(vec![0_u8; prime_len]);
        let mut padded_q = Zeroizing::new(vec![0_u8; prime_len]);
        padded_p[prime_len - p.len()..].copy_from_slice(&p);
        padded_q[prime_len - q.len()..].copy_from_slice(&q);
        if padded_p.as_slice() == padded_q.as_slice() {
            return Err(error.to_string());
        }
        prime_one = Some(padded_p);
        prime_two = Some(padded_q);
    }

    let private_bytes = if private {
        prime_len.checked_mul(2).ok_or_else(|| error.to_string())?
    } else {
        0
    };
    let capacity = 24_usize
        .checked_add(exponent.len())
        .and_then(|value| value.checked_add(modulus_len))
        .and_then(|value| value.checked_add(private_bytes))
        .ok_or_else(|| error.to_string())?;
    let bit_length = modulus_len
        .checked_mul(8)
        .and_then(|value| u32::try_from(value).ok())
        .ok_or_else(|| error.to_string())?;
    let exponent_len = u32::try_from(exponent.len()).map_err(|_| error.to_string())?;
    let modulus_len_u32 = u32::try_from(modulus_len).map_err(|_| error.to_string())?;
    let prime_len_u32 = if private {
        u32::try_from(prime_len).map_err(|_| error.to_string())?
    } else {
        0
    };
    let magic = if private {
        BCRYPT_RSAPRIVATE_MAGIC.0
    } else {
        BCRYPT_RSAPUBLIC_MAGIC.0
    };

    let mut blob = Zeroizing::new(Vec::with_capacity(capacity));
    for value in [
        magic,
        bit_length,
        exponent_len,
        modulus_len_u32,
        prime_len_u32,
        prime_len_u32,
    ] {
        blob.extend_from_slice(&value.to_le_bytes());
    }
    blob.extend_from_slice(&exponent);
    blob.extend_from_slice(&modulus);
    if let (Some(p), Some(q)) = (prime_one.as_ref(), prime_two.as_ref()) {
        blob.extend_from_slice(p);
        blob.extend_from_slice(q);
    }
    if blob.len() != capacity {
        return Err(error.to_string());
    }
    Ok((blob, modulus_len))
}

#[cfg(target_os = "windows")]
struct CngAlgorithm(windows::Win32::Security::Cryptography::BCRYPT_ALG_HANDLE);

#[cfg(target_os = "windows")]
impl CngAlgorithm {
    fn open_rsa() -> Result<Self, String> {
        use windows::Win32::Security::Cryptography::{
            BCryptOpenAlgorithmProvider, BCRYPT_ALG_HANDLE, BCRYPT_OPEN_ALGORITHM_PROVIDER_FLAGS,
            BCRYPT_RSA_ALGORITHM, MS_PRIMITIVE_PROVIDER,
        };

        let mut handle = BCRYPT_ALG_HANDLE::default();
        let status = unsafe {
            BCryptOpenAlgorithmProvider(
                &mut handle,
                BCRYPT_RSA_ALGORITHM,
                MS_PRIMITIVE_PROVIDER,
                BCRYPT_OPEN_ALGORITHM_PROVIDER_FLAGS(0),
            )
        };
        let provider = Self(handle);
        if !status.is_ok() || provider.0.is_invalid() {
            return Err("crypto:rsa-provider".to_string());
        }
        Ok(provider)
    }
}

#[cfg(target_os = "windows")]
impl Drop for CngAlgorithm {
    fn drop(&mut self) {
        use windows::Win32::Security::Cryptography::BCryptCloseAlgorithmProvider;

        if !self.0.is_invalid() {
            let _ = unsafe { BCryptCloseAlgorithmProvider(self.0, 0) };
        }
    }
}

#[cfg(target_os = "windows")]
struct CngKey(windows::Win32::Security::Cryptography::BCRYPT_KEY_HANDLE);

#[cfg(target_os = "windows")]
impl CngKey {
    fn import(provider: &CngAlgorithm, blob: &[u8], private: bool) -> Result<Self, String> {
        use windows::Win32::Security::Cryptography::{
            BCryptImportKeyPair, BCRYPT_KEY_HANDLE, BCRYPT_RSAPRIVATE_BLOB, BCRYPT_RSAPUBLIC_BLOB,
        };

        let error = if private {
            "crypto:rsa-private-key"
        } else {
            "crypto:rsa-public-key"
        };
        let mut handle = BCRYPT_KEY_HANDLE::default();
        let blob_type = if private {
            BCRYPT_RSAPRIVATE_BLOB
        } else {
            BCRYPT_RSAPUBLIC_BLOB
        };
        let status = unsafe {
            BCryptImportKeyPair(
                provider.0,
                BCRYPT_KEY_HANDLE::default(),
                blob_type,
                &mut handle,
                blob,
                0,
            )
        };
        let key = Self(handle);
        if !status.is_ok() || key.0.is_invalid() {
            return Err(error.to_string());
        }
        Ok(key)
    }
}

#[cfg(target_os = "windows")]
impl Drop for CngKey {
    fn drop(&mut self) {
        use windows::Win32::Security::Cryptography::BCryptDestroyKey;

        if !self.0.is_invalid() {
            let _ = unsafe { BCryptDestroyKey(self.0) };
        }
    }
}

#[cfg(target_os = "windows")]
fn operation_blocking(
    operation: String,
    input: String,
    key: RsaLegacyKeyComponents,
) -> Result<String, String> {
    use base64::Engine;
    use windows::Win32::Security::Cryptography::{BCryptDecrypt, BCryptEncrypt, BCRYPT_PAD_PKCS1};

    let input = Zeroizing::new(input);
    let private = match operation.as_str() {
        "encrypt" => false,
        "decrypt" => true,
        _ => return Err("crypto:invalid-operation".to_string()),
    };
    let (blob, modulus_len) = cng_blob(&key, private)?;
    let provider = CngAlgorithm::open_rsa()?;
    let key = CngKey::import(&provider, blob.as_slice(), private)?;

    if !private {
        let max_plaintext = modulus_len
            .checked_sub(11)
            .ok_or_else(|| "crypto:rsa-encrypt".to_string())?;
        if input.len() > max_plaintext {
            return Err("crypto:rsa-encrypt".to_string());
        }
        let mut encrypted = vec![0_u8; modulus_len];
        let mut written = 0_u32;
        let status = unsafe {
            BCryptEncrypt(
                key.0,
                Some(input.as_bytes()),
                None,
                None,
                Some(encrypted.as_mut_slice()),
                &mut written,
                BCRYPT_PAD_PKCS1,
            )
        };
        let written = usize::try_from(written).map_err(|_| "crypto:rsa-encrypt".to_string())?;
        if !status.is_ok() || written != modulus_len || written > encrypted.len() {
            return Err("crypto:rsa-encrypt".to_string());
        }
        encrypted.truncate(written);
        return Ok(base64::engine::general_purpose::STANDARD.encode(encrypted));
    }

    let ciphertext = decode_ciphertext(&input)?;
    if ciphertext.len() != modulus_len {
        return Err("crypto:rsa-ciphertext".to_string());
    }
    let mut plaintext = Zeroizing::new(vec![0_u8; modulus_len]);
    let mut written = 0_u32;
    let status = unsafe {
        BCryptDecrypt(
            key.0,
            Some(ciphertext.as_slice()),
            None,
            None,
            Some(plaintext.as_mut_slice()),
            &mut written,
            BCRYPT_PAD_PKCS1,
        )
    };
    let written = usize::try_from(written).map_err(|_| "crypto:rsa-decrypt".to_string())?;
    if !status.is_ok() || written > plaintext.len() {
        return Err("crypto:rsa-decrypt".to_string());
    }
    std::str::from_utf8(&plaintext[..written])
        .map(str::to_owned)
        .map_err(|_| "crypto:rsa-utf8".to_string())
}

#[cfg(not(target_os = "windows"))]
fn operation_blocking(
    _operation: String,
    mut input: String,
    _key: RsaLegacyKeyComponents,
) -> Result<String, String> {
    input.zeroize();
    Err("crypto:rsa-platform".to_string())
}

#[tauri::command]
pub(crate) async fn rsa_legacy_operation(
    operation: String,
    input: String,
    key: RsaLegacyKeyComponents,
) -> Result<String, String> {
    tokio::task::spawn_blocking(move || operation_blocking(operation, input, key))
        .await
        .map_err(|_| "crypto:rsa-worker-failed".to_string())?
}

#[cfg(all(test, target_os = "windows"))]
mod tests {
    use super::*;
    use base64::Engine;

    const N: &str =
        "w_9zu5K0WLWwsMoNHGCf3DkjxMdsjzc9XNt-Eqw7lO6kI6xvrFS0ZDOLWX_VulFItrgxC0rLhqXJEZ3OIaoIXQ";
    const E: &str = "AQAB";
    const P: &str = "6OyI0WxclOjns7r8MO_izcHEW63cPevr8MyA94neeT0";
    const Q: &str = "12pj5CFsI67Ruqe1jJ8wrAGwe7svBEl7smZ5fqCRfaE";

    fn public_key() -> RsaLegacyKeyComponents {
        RsaLegacyKeyComponents {
            n: N.to_string(),
            e: E.to_string(),
            p: None,
            q: None,
        }
    }

    fn private_key() -> RsaLegacyKeyComponents {
        RsaLegacyKeyComponents {
            n: N.to_string(),
            e: E.to_string(),
            p: Some(P.to_string()),
            q: Some(Q.to_string()),
        }
    }

    #[test]
    fn pkcs1_round_trip_handles_unicode() {
        for plaintext in ["", "ToolKnit 中文", &"x".repeat(53)] {
            let ciphertext =
                operation_blocking("encrypt".to_string(), plaintext.to_string(), public_key())
                    .unwrap();
            let decrypted =
                operation_blocking("decrypt".to_string(), ciphertext, private_key()).unwrap();
            assert_eq!(decrypted, plaintext);
        }
    }

    #[test]
    fn pkcs1_rejects_invalid_boundaries_and_key_material() {
        assert_eq!(
            operation_blocking("encrypt".to_string(), "x".repeat(54), public_key()).unwrap_err(),
            "crypto:rsa-encrypt"
        );

        let missing_prime = RsaLegacyKeyComponents {
            n: N.to_string(),
            e: E.to_string(),
            p: Some(P.to_string()),
            q: None,
        };
        assert_eq!(
            operation_blocking("decrypt".to_string(), "AA==".to_string(), missing_prime,)
                .unwrap_err(),
            "crypto:rsa-private-key"
        );

        let noncanonical = RsaLegacyKeyComponents {
            n: format!("{N}="),
            e: E.to_string(),
            p: None,
            q: None,
        };
        assert_eq!(
            operation_blocking("encrypt".to_string(), "test".to_string(), noncanonical)
                .unwrap_err(),
            "crypto:rsa-public-key"
        );

        let short_ciphertext = base64::engine::general_purpose::STANDARD.encode([0_u8; 63]);
        assert_eq!(
            operation_blocking("decrypt".to_string(), short_ciphertext, private_key(),)
                .unwrap_err(),
            "crypto:rsa-ciphertext"
        );
        let corrupt_ciphertext = base64::engine::general_purpose::STANDARD.encode([0_u8; 64]);
        assert_eq!(
            operation_blocking("decrypt".to_string(), corrupt_ciphertext, private_key())
                .unwrap_err(),
            "crypto:rsa-decrypt"
        );
        assert_eq!(
            operation_blocking(
                "decrypt".to_string(),
                "not canonical\n".to_string(),
                private_key(),
            )
            .unwrap_err(),
            "crypto:rsa-ciphertext"
        );
    }
}
