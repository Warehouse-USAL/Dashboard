.PHONY: help up-dev run up-prod down build clean type-check lint format format-fix pr-checks logs

.DEFAULT_GOAL := help

help: ## Show available commands
	@echo ""
	@echo "SmartWarehouse Dashboard — available commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ─── Docker targets ───────────────────────────────────────────────────────────

up-dev: ## Start Vite dev server in Docker (BACKEND_URL defaults to http://host.docker.internal:8090)
	docker compose up --build
	@echo ""
	@echo "Dashboard started: http://localhost:5173"
	@echo ""

run: up-dev ## Alias for up-dev

up-prod: ## Start nginx self-hosted container (requires BACKEND_URL env var)
	docker compose -f docker-compose.prod.yml up -d
	@echo "Dashboard started on http://localhost:80"

down: ## Stop and remove containers
	docker compose down

# ─── Build targets ────────────────────────────────────────────────────────────

build: ## Run production build
	bun run build
	@echo "Build complete"

clean: ## Remove build artifacts (dist/ and .cloudflare/)
	rm -rf dist .cloudflare
	@echo "Cleaned dist/ and .cloudflare/"

# ─── Quality targets ──────────────────────────────────────────────────────────

type-check: ## Run TypeScript type-check
	bun run type-check

lint: ## Run ESLint on src/
	bun run lint

format: ## Check formatting with Prettier
	bun run format:check

format-fix: ## Apply Prettier to all files
	bun run format

# ─── CI gate ──────────────────────────────────────────────────────────────────

pr-checks: ## Run all checks before opening a PR (mirrors CI exactly)
	@echo "Running pre-PR checks..."
	bun run type-check
	bun run lint
	bun run format:check
	bun run build
	@echo ""
	@echo "All checks passed. Ready to open a PR."

# ─── Observability ────────────────────────────────────────────────────────────

logs: ## Follow dashboard container logs
	docker compose logs -f dashboard
