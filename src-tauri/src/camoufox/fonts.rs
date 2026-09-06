//! OS-specific font lists for Camoufox.
//!
//! Provides default system fonts for Windows, macOS, and Linux.

use std::collections::HashMap;

use crate::camoufox::data;

/// Get fonts for the target OS.
pub fn get_fonts_for_os(target_os: &str) -> Vec<String> {
  let fonts_map: HashMap<String, Vec<String>> =
    serde_json::from_str(data::FONTS_JSON).unwrap_or_default();

  let os_key = match target_os {
    "win" | "windows" => "win",
    "mac" | "macos" => "mac",
    "lin" | "linux" => "lin",
    _ => "win", // Default to Windows fonts
  };

  fonts_map.get(os_key).cloned().unwrap_or_default()
}

/// Randomize a font list so each launch exposes a different subset.
///
/// Keeps every entry of `always_keep` (explicit custom fonts), shuffles the
/// rest, and truncates to a random length in [60%, 100%] (min 10 fonts).
/// Sorted at the end so the order looks like a natural OS enumeration.
pub fn random_font_subset(mut all: Vec<String>, always_keep: &[String]) -> Vec<String> {
  use rand::RngExt;
  let mut rng = rand::rng();
  // Fisher-Yates shuffle (avoids depending on SliceRandom across rand versions).
  if all.len() > 1 {
    for i in (1..all.len()).rev() {
      let j = rng.random_range(0..=i);
      all.swap(i, j);
    }
  }
  let min = (all.len() * 6 / 10).max(10.min(all.len()));
  let n = if all.len() > min {
    rng.random_range(min..=all.len())
  } else {
    all.len()
  };
  let mut subset: Vec<String> = all.into_iter().take(n).collect();
  for font in always_keep {
    if !subset.contains(font) {
      subset.push(font.clone());
    }
  }
  subset.sort();
  subset
}
pub fn get_fonts_with_custom(target_os: &str, custom_fonts: Option<&[String]>) -> Vec<String> {
  let mut fonts = get_fonts_for_os(target_os);

  if let Some(custom) = custom_fonts {
    // Add custom fonts, avoiding duplicates
    for font in custom {
      if !fonts.contains(font) {
        fonts.push(font.clone());
      }
    }
  }

  fonts
}

#[cfg(test)]
mod tests {
  use super::*;

  #[test]
  fn test_get_fonts_for_windows() {
    let fonts = get_fonts_for_os("win");
    assert!(!fonts.is_empty());
    assert!(fonts.contains(&"Arial".to_string()));
    assert!(fonts.contains(&"Calibri".to_string()));
  }

  #[test]
  fn test_get_fonts_for_macos() {
    let fonts = get_fonts_for_os("mac");
    assert!(!fonts.is_empty());
    assert!(fonts.contains(&"Helvetica".to_string()));
  }

  #[test]
  fn test_get_fonts_for_linux() {
    let fonts = get_fonts_for_os("lin");
    assert!(!fonts.is_empty());
  }

  #[test]
  fn test_get_fonts_with_custom() {
    let custom = vec!["MyCustomFont".to_string()];
    let fonts = get_fonts_with_custom("win", Some(&custom));

    assert!(fonts.contains(&"MyCustomFont".to_string()));
    assert!(fonts.contains(&"Arial".to_string()));
  }

  #[test]
  fn test_random_font_subset_keeps_custom() {
    let all: Vec<String> = (0..50).map(|i| format!("Font{i}")).collect();
    let custom = vec!["MyCustomFont".to_string()];
    let subset = random_font_subset(all, &custom);
    assert!(subset.contains(&"MyCustomFont".to_string()));
    assert!((30..=51).contains(&subset.len()));
    let mut sorted = subset.clone();
    sorted.sort();
    assert_eq!(subset, sorted);
  }

  #[test]
  fn test_fonts_no_duplicates() {
    let custom = vec!["Arial".to_string()]; // Arial already exists in Windows fonts
    let fonts = get_fonts_with_custom("win", Some(&custom));

    // Count occurrences of Arial
    let arial_count = fonts.iter().filter(|f| *f == "Arial").count();
    assert_eq!(arial_count, 1);
  }
}
