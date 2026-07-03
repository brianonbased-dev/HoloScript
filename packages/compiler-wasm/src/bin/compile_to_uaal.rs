use std::io::{self, Read};

fn main() {
    let mut source = String::new();
    if let Err(error) = io::stdin().read_to_string(&mut source) {
        println!(r#"{{"error":"failed to read stdin: {}"}}"#, error);
        std::process::exit(1);
    }

    println!("{}", holoscript_wasm::compile_to_uaal(&source));
}
