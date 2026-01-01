.PHONY: gen-entities gen-entities-tauri gen-icons dev build test clean help

MISE := $(shell command -v mise 2>/dev/null)
MISE_EXEC := $(if $(MISE),$(MISE) exec --,)
RUSTUP := $(shell command -v rustup 2>/dev/null)
RUSTFMT_CMD := $(if $(RUSTUP),$(RUSTUP) run nightly rustfmt,rustfmt)

# Default target
help:
	@echo "Available commands:"
	@echo "  make gen-entities  - Generate SeaORM entities from database schema"
	@echo "  make dev           - Run development server"
	@echo "  make build         - Build all packages"
	@echo "  make test          - Run all tests"
	@echo "  make clean         - Clean build artifacts"
	@echo "  make gen-icons     - Generate base icon and Tauri icon assets"

# Generate SeaORM entities using xtask
gen-entities:
	RUSTFMT="$(RUSTFMT_CMD)" $(MISE_EXEC) cargo run -p xtask -- gen-entities

# Generate ts types from tauri commands
gen-entities-tauri:
	$(MISE_EXEC) tauri-ts-generator generate --config tauri-codegen.toml --verbose

# Generate base icon and all Tauri icon assets
gen-icons:
	$(MISE_EXEC) python3 scripts/gen_icon.py
	$(MISE_EXEC) cargo tauri icon src-tauri/icons/base.png

# Run Tauri development server
dev:
	$(MISE_EXEC) cargo tauri dev

# Build all packages
build:
	$(MISE_EXEC) cargo tauri build

# Run tests
test:
	$(MISE_EXEC) cargo test

# Clean build artifacts
clean:
	$(MISE_EXEC) cargo clean
