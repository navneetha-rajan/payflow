.PHONY: static format lint test install

# Install dependencies
install:
	uv sync

# Run static analysis (prospector + mypy)
# Uses prospector.yml and mypy.ini for file discovery and exclusions
static:
	@echo "Running static analysis..."
	@exit_code=0; \
	PYTHONPATH=$$(pwd) DJANGO_SETTINGS_MODULE=config.settings \
		uv run prospector --profile prospector.yml || exit_code=1; \
	MYPYPATH=$$(pwd) uv run mypy --config-file mypy.ini --explicit-package-bases || exit_code=1; \
	exit $$exit_code

format:
	uv run ruff format .
	uv run ruff check --fix .

lint:
	PYTHONPATH=$$(pwd) DJANGO_SETTINGS_MODULE=config.settings uv run prospector --profile prospector.yml

test:
	DJANGO_SETTINGS_MODULE=config.settings uv run pytest --rootdir=.
