use crate::browser_runner::BrowserRunner;
use crate::profile::BrowserProfile;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use tokio::process::Command as TokioCommand;
use tokio::sync::Mutex as AsyncMutex;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct CloakConfig {
  /// Fixed fingerprint seed — same seed = same identity across restarts
  #[serde(default)]
  pub fingerprint_seed: Option<u32>,
  /// Randomize the fingerprint seed on every launch
  #[serde(default)]
  pub randomize_fingerprint_on_launch: Option<bool>,
  /// Auto-derive timezone/locale/WebRTC from proxy IP
  #[serde(default)]
  pub geoip: Option<bool>,
  /// Humanize mouse/keyboard/scroll interactions
  #[serde(default)]
  pub humanize: Option<bool>,
  /// Spoof target OS ("windows" | "macos" | "linux")
  #[serde(default)]
  pub os: Option<String>,
  /// Injected at launch, never persisted
  #[serde(default, skip_serializing)]
  pub proxy: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloakLaunchResult {
  pub id: String,
  pub process_id: Option<u32>,
  pub profile_path: Option<String>,
  pub cdp_port: Option<u16>,
  pub url: Option<String>,
}

#[allow(dead_code)]
struct CloakInstance {
  id: String,
  process_id: Option<u32>,
  profile_path: Option<String>,
  cdp_port: Option<u16>,
}

struct CloakManagerInner {
  instances: HashMap<String, CloakInstance>,
}

pub struct CloakManager {
  inner: Arc<AsyncMutex<CloakManagerInner>>,
  #[allow(dead_code)]
  http_client: Client,
}

static CLOAK_MANAGER: std::sync::LazyLock<CloakManager> =
  std::sync::LazyLock::new(CloakManager::new);

impl CloakManager {
  fn new() -> Self {
    Self {
      inner: Arc::new(AsyncMutex::new(CloakManagerInner {
        instances: HashMap::new(),
      })),
      http_client: Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .expect("Failed to build reqwest client for cloak_manager"),
    }
  }

  pub fn instance() -> &'static CloakManager {
    &CLOAK_MANAGER
  }

  async fn find_free_port() -> Result<u16, Box<dyn std::error::Error + Send + Sync>> {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
  }

  #[allow(dead_code)]
  pub fn get_executable_path(
    profile: &BrowserProfile,
  ) -> Result<PathBuf, Box<dyn std::error::Error + Send + Sync>> {
    let binaries_dir = crate::app_dirs::binaries_dir();
    let mut browser_dir = binaries_dir;
    browser_dir.push("cloak");
    browser_dir.push(&profile.version);

    let exe = if cfg!(target_os = "windows") {
      browser_dir.join("cloakbrowser.exe")
    } else if cfg!(target_os = "macos") {
      // Look for the binary inside the extracted archive
      let candidates = ["cloakbrowser", "Cloakbrowser", "CloakBrowser"];
      candidates
        .iter()
        .map(|name| browser_dir.join(name))
        .find(|p| p.exists())
        .unwrap_or_else(|| browser_dir.join("cloakbrowser"))
    } else {
      browser_dir.join("cloakbrowser")
    };

    if exe.exists() {
      Ok(exe)
    } else {
      Err(
        format!(
          "CloakBrowser executable not found at {}. Please download CloakBrowser first.",
          exe.display()
        )
        .into(),
      )
    }
  }

  #[allow(clippy::too_many_arguments)]
  pub async fn launch_cloak(
    &self,
    _app_handle: &AppHandle,
    profile: &BrowserProfile,
    profile_path: &str,
    config: &CloakConfig,
    url: Option<&str>,
    proxy_url: Option<&str>,
    _ephemeral: bool,
    extension_paths: &[String],
    remote_debugging_port: Option<u16>,
    headless: bool,
  ) -> Result<CloakLaunchResult, Box<dyn std::error::Error + Send + Sync>> {
    let executable_path = BrowserRunner::instance()
      .get_browser_executable_path(profile)
      .map_err(|e| format!("Failed to get CloakBrowser executable path: {e}"))?;

    let port = match remote_debugging_port {
      Some(p) => p,
      None => Self::find_free_port().await?,
    };

    log::info!("Launching CloakBrowser on CDP port {port}");

    let mut cmd = TokioCommand::new(&executable_path);

    // Core args
    cmd
      .arg(format!("--remote-debugging-port={port}"))
      .arg("--remote-debugging-address=127.0.0.1")
      .arg(format!("--user-data-dir={profile_path}"))
      .arg("--no-first-run")
      .arg("--no-default-browser-check")
      .arg("--use-mock-keychain")
      .arg("--password-store=basic");

    // Fingerprint seed
    if let Some(seed) = config.fingerprint_seed {
      cmd.arg(format!("--fingerprint={seed}"));
    }

    // Platform spoofing
    if let Some(ref os) = config.os {
      cmd.arg(format!("--fingerprint-platform={os}"));
    }

    // Humanize
    if config.humanize == Some(true) {
      cmd.arg("--humanize=true");
    }

    // Proxy
    if let Some(proxy) = proxy_url {
      cmd.arg(format!("--proxy-server={proxy}"));
    }

    // GeoIP: derive timezone/locale from proxy
    if config.geoip == Some(true) && proxy_url.is_some() {
      cmd.arg("--geoip=true");
    }

    // Extensions
    if !extension_paths.is_empty() {
      let extensions_arg = extension_paths.join(",");
      cmd.arg(format!("--load-extension={extensions_arg}"));
    }

    if headless {
      cmd.arg("--headless=new").arg("--disable-gpu");
    }

    // Open URL
    if let Some(u) = url {
      cmd.arg(u);
    }

    #[cfg(target_os = "linux")]
    cmd
      .arg("--no-sandbox")
      .arg("--disable-setuid-sandbox")
      .arg("--disable-dev-shm-usage");

    cmd.stdout(Stdio::null()).stderr(Stdio::null());

    // Detach the process so it outlives the parent
    #[cfg(unix)]
    {
      #[allow(unused_imports)]
      use std::os::unix::process::CommandExt;
      unsafe {
        cmd.pre_exec(|| {
          libc::setsid();
          Ok(())
        });
      }
    }

    let child = cmd.spawn().map_err(|e| {
      let hint = if e.raw_os_error() == Some(14001) {
        ". Visual C++ Redistributable may not be installed."
      } else {
        ""
      };
      format!("Failed to spawn CloakBrowser: {e}{hint}")
    })?;

    let pid = child.id().unwrap_or(0);
    // Detach — don't await the child
    drop(child);

    let instance_id = uuid::Uuid::new_v4().to_string();
    let result = CloakLaunchResult {
      id: instance_id.clone(),
      process_id: Some(pid),
      profile_path: Some(profile_path.to_string()),
      cdp_port: Some(port),
      url: Some(format!("http://127.0.0.1:{port}")),
    };

    let mut inner = self.inner.lock().await;
    inner.instances.insert(
      instance_id.clone(),
      CloakInstance {
        id: instance_id,
        process_id: Some(pid),
        profile_path: Some(profile_path.to_string()),
        cdp_port: Some(port),
      },
    );

    Ok(result)
  }

  #[allow(dead_code)]
  pub async fn stop_cloak(
    &self,
    instance_id: &str,
  ) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let mut inner = self.inner.lock().await;
    if let Some(instance) = inner.instances.remove(instance_id) {
      if let Some(pid) = instance.process_id {
        #[cfg(unix)]
        {
          use nix::sys::signal::{kill, Signal};
          use nix::unistd::Pid;
          let _ = kill(Pid::from_raw(pid as i32), Signal::SIGTERM);
        }
        #[cfg(windows)]
        {
          let _ = std::process::Command::new("taskkill")
            .args(["/F", "/PID", &pid.to_string()])
            .output();
        }
      }
    }
    Ok(())
  }

  #[allow(dead_code)]
  pub async fn find_cloak_by_profile(&self, profile_path: &str) -> Option<CloakLaunchResult> {
    let inner = self.inner.lock().await;
    inner
      .instances
      .values()
      .find(|i| i.profile_path.as_deref() == Some(profile_path))
      .map(|i| CloakLaunchResult {
        id: i.id.clone(),
        process_id: i.process_id,
        profile_path: i.profile_path.clone(),
        cdp_port: i.cdp_port,
        url: i.cdp_port.map(|p| format!("http://127.0.0.1:{p}")),
      })
  }
}
