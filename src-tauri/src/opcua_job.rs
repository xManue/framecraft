use std::process::Child;

#[cfg(windows)]
pub(super) struct OwnedJob(windows_sys::Win32::Foundation::HANDLE);
#[cfg(windows)]
impl OwnedJob {
    pub(super) fn attach(child: &Child) -> Result<Self, String> {
        use std::os::windows::io::AsRawHandle;
        use windows_sys::Win32::{Foundation::CloseHandle, System::JobObjects::*};
        // Only our child handle is assigned; no PID lookup or taskkill against reused IDs.
        unsafe {
            let handle = CreateJobObjectW(std::ptr::null(), std::ptr::null());
            if handle.is_null() {
                return Err("OPC_UA_DESKTOP_PROCESS".into());
            }
            let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
            info.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
            if SetInformationJobObject(
                handle,
                JobObjectExtendedLimitInformation,
                &info as *const _ as _,
                std::mem::size_of_val(&info) as u32,
            ) == 0
                || AssignProcessToJobObject(handle, child.as_raw_handle() as _) == 0
            {
                CloseHandle(handle);
                return Err("OPC_UA_DESKTOP_PROCESS".into());
            }
            Ok(Self(handle))
        }
    }
    pub(super) fn terminate(&self) {
        unsafe {
            windows_sys::Win32::System::JobObjects::TerminateJobObject(self.0, 1);
        }
    }
}
#[cfg(windows)]
impl Drop for OwnedJob {
    fn drop(&mut self) {
        unsafe {
            windows_sys::Win32::Foundation::CloseHandle(self.0);
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;
    use std::{
        io::{BufRead, Write},
        sync::mpsc,
        thread,
        time::{Duration, Instant},
    };
    #[test]
    fn owned_job_termination_and_drop_kill_only_the_owned_process_tree() {
        use std::os::windows::io::{AsRawHandle, FromRawHandle, OwnedHandle};
        use windows_sys::Win32::System::Threading::{
            GetExitCodeProcess, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
        };
        let directory = tempfile::tempdir().unwrap();
        let paths = std::env::var_os("PATH").unwrap();
        let node = std::env::split_paths(&paths)
            .filter(|p| p.is_absolute())
            .map(|p| p.join("node.exe"))
            .find(|p| p.is_file())
            .unwrap();
        for explicit in [false, true] {
            let code="const{spawn}=require('node:child_process');process.stdin.once('data',()=>{const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore',windowsHide:true});process.stdout.write(child.pid+'\\n');setInterval(()=>{},1000)});";
            let mut child = crate::background_command(&node)
                .args(["--eval", code])
                .current_dir(directory.path())
                .env_remove("NODE_OPTIONS")
                .env_remove("NODE_PATH")
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::null())
                .spawn()
                .unwrap();
            let job = OwnedJob::attach(&child).unwrap();
            let stdout = child.stdout.take().unwrap();
            let (send, output) = mpsc::channel();
            let reader = thread::spawn(move || {
                let mut line = String::new();
                std::io::BufReader::new(stdout)
                    .read_line(&mut line)
                    .unwrap();
                let _ = send.send(line);
            });
            child.stdin.as_mut().unwrap().write_all(b"go\n").unwrap();
            let pid = output
                .recv_timeout(Duration::from_secs(10))
                .unwrap()
                .trim()
                .parse::<u32>()
                .unwrap();
            let raw = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
            assert!(!raw.is_null());
            let descendant = unsafe { OwnedHandle::from_raw_handle(raw as _) };
            if explicit {
                job.terminate();
            }
            drop(job);
            let start = Instant::now();
            loop {
                let mut status = 0;
                assert_ne!(
                    unsafe { GetExitCodeProcess(descendant.as_raw_handle() as _, &mut status) },
                    0
                );
                if status != 259 {
                    break;
                }
                assert!(start.elapsed() < Duration::from_secs(5));
                thread::sleep(Duration::from_millis(20));
            }
            let _ = child.wait();
            reader.join().unwrap();
        }
    }
}

#[cfg(not(windows))]
pub(super) struct OwnedJob;
#[cfg(not(windows))]
impl OwnedJob {
    pub(super) fn attach(_: &Child) -> Result<Self, String> {
        Err("OPC_UA_DESKTOP_PLATFORM".into())
    }
    pub(super) fn terminate(&self) {}
}
