use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub enum DeduplicationMethod {
    SizeAndTime,
    Hash,
}

pub struct BackupManager {
    pub dedupe_method: DeduplicationMethod,
}

impl BackupManager {
    pub fn new(method: DeduplicationMethod) -> Self {
        Self {
            dedupe_method: method,
        }
    }

    pub fn backup(&self, source: &Path, destination: &Path) -> Result<(), String> {
        if !source.exists() {
            return Err(format!("Source path {} does not exist", source.display()));
        }

        if source.is_dir() {
            self.backup_dir(source, destination)
        } else {
            self.backup_file(source, destination)
        }
    }

    fn backup_dir(&self, source: &Path, destination: &Path) -> Result<(), String> {
        fs::create_dir_all(destination).map_err(|e| e.to_string())?;

        for entry in fs::read_dir(source).map_err(|e| e.to_string())? {
            let entry = entry.map_err(|e| e.to_string())?;
            let path = entry.path();
            let dest_path = destination.join(entry.file_name());

            if path.is_dir() {
                self.backup_dir(&path, &dest_path)?;
            } else {
                self.backup_file(&path, &dest_path)?;
            }
        }
        Ok(())
    }

    fn backup_file(&self, source: &Path, destination: &Path) -> Result<(), String> {
        if destination.exists() {
            if self.is_duplicate(source, destination)? {
                return Ok(()); // Skip duplicate
            }
        }

        fs::create_dir_all(destination.parent().unwrap()).map_err(|e| e.to_string())?;
        fs::copy(source, destination).map_err(|e| e.to_string())?;
        Ok(())
    }

    fn is_duplicate(&self, source: &Path, destination: &Path) -> Result<bool, String> {
        match self.dedupe_method {
            DeduplicationMethod::SizeAndTime => {
                let s_meta = fs::metadata(source).map_err(|e| e.to_string())?;
                let d_meta = fs::metadata(destination).map_err(|e| e.to_string())?;

                Ok(s_meta.len() == d_meta.len()
                    && s_meta.modified().map_err(|e| e.to_string())?
                        == d_meta.modified().map_err(|e| e.to_string())?)
            }
            DeduplicationMethod::Hash => {
                let s_hash = self.compute_hash(source)?;
                let d_hash = self.compute_hash(destination)?;
                Ok(s_hash == d_hash)
            }
        }
    }

    fn compute_hash(&self, path: &Path) -> Result<String, String> {
        let meta = fs::metadata(path).map_err(|e| e.to_string())?;
        Ok(format!(
            "{}-{}",
            meta.len(),
            path.file_name().unwrap_or_default().to_string_lossy()
        ))
    }
}
