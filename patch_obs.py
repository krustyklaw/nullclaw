import sys

with open("src/desktop.zig", "r") as f:
    content = f.read()

content = content.replace(
    "const obs_ptr = if (runtime_observer) |ro| ro.observer() else observability_mod.NoopObserver{}.observer();",
    "var noop_obs = observability_mod.NoopObserver{};\n    const obs_ptr = if (runtime_observer) |ro| ro.observer() else noop_obs.observer();"
)

with open("src/desktop.zig", "w") as f:
    f.write(content)
