//! Milton CLI entrypoint.

use std::env;
use std::process::ExitCode;

const VERSION: &str = "0.4.2";

fn main() -> ExitCode {
    let args: Vec<String> = env::args().collect();
    let cmd = args.get(1).map(String::as_str).unwrap_or("help");
    match cmd {
        "loop" | "selfplay" | "train" | "arena" | "lichess" | "inspect" => run_stage(cmd),
        "version" | "--version" | "-V" => {
            println!("milton {VERSION}");
            ExitCode::SUCCESS
        }
        "help" | "--help" | "-h" => {
            print_help();
            ExitCode::SUCCESS
        }
        unknown => {
            eprintln!("milton: unknown command '{unknown}'");
            print_help();
            ExitCode::from(2)
        }
    }
}

fn run_stage(stage: &str) -> ExitCode {
    println!("[milton] running stage: {stage}");
    println!("[milton] stub binary; full pipeline lives in unreleased crates");
    ExitCode::SUCCESS
}

fn print_help() {
    println!("milton {VERSION}");
    println!();
    println!("Usage: milton <command> [args]");
    println!();
    println!("Commands:");
    println!("  loop       Run the four-stage self-improvement cycle");
    println!("  selfplay   Run a single self-play iteration");
    println!("  train      Train against the latest sample window");
    println!("  arena      Run an ad-hoc arena match");
    println!("  lichess    Connect the current champion to Lichess");
    println!("  inspect    Inspect an iteration directory");
    println!("  version    Print the version and exit");
    println!("  help       Show this message");
}
