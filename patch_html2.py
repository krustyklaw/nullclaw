import sys
with open("src/assets/app.html", "r") as f:
    content = f.read()

search_code = """                        const response = data.response || "";
                        appendMessage("ai", response);
                        history.push({ role: "assistant", content: response });

                        if (data.thread_events && data.thread_events.length > 0) {
                            const tool_execs = data.thread_events.filter(e => e.type === "tool_execution");
                            if (tool_execs.length > 0) {
                                const tool_list = tool_execs.map(e => e.tool).join(', ');
                                const toolHtml = `<div style="font-size:11px;color:var(--text2);margin-top:4px;">Uses tools: ${tool_list}</div>`;
                                const msgs = document.getElementById("messages");
                                const lastBubble = msgs.lastElementChild.querySelector('.message-bubble');
                                if (lastBubble) {
                                    lastBubble.innerHTML += toolHtml;
                                }
                            }
                        }"""
replacement_code = """                        const response = data.response || "";
                        appendMessage("ai", response);
                        history.push({ role: "assistant", content: response });

                        if (data.thread_events && data.thread_events.length > 0) {
                            const tool_execs = data.thread_events.filter(e => e.type === 'tool_execution');
                            if (tool_execs.length > 0) {
                                const tool_list = tool_execs.map(e => e.tool).join(', ');
                                const toolHtml = `<div style="font-size:11px;color:var(--text2);margin-top:4px;">Uses tools: ${tool_list}</div>`;
                                const msgs = document.getElementById("messages");
                                const lastBubble = msgs.lastElementChild.querySelector('.message-bubble');
                                if (lastBubble) {
                                    lastBubble.insertAdjacentHTML('beforeend', toolHtml);
                                }
                            }
                        }"""
if search_code in content:
    content = content.replace(search_code, replacement_code)
    print("HTML UPDATED")

with open("src/assets/app.html", "w") as f:
    f.write(content)
