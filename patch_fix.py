import sys

with open("src/desktop.zig", "r") as f:
    content = f.read()

content = content.replace('try w.writeAll("{"type":"tool_execution","tool":"");', 'try w.writeAll("{\\"type\\":\\"tool_execution\\\",\\"tool\\":\\"");')
content = content.replace('try w.writeAll("","success":");', 'try w.writeAll("\\\",\\"success\\\":");')
content = content.replace('try w.writeAll("{"type":"tool_summary","total":");', 'try w.writeAll("{\\"type\\":\\"tool_summary\\\",\\"total\\\":");')
content = content.replace('try w.writeAll(","failed":");', 'try w.writeAll(",\\"failed\\\":");')

with open("src/desktop.zig", "w") as f:
    f.write(content)
