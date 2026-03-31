import sys

with open("src/assets/app.html", "r") as f:
    content = f.read()

search_code = """                    if (data.error) {
                        const detail = data.detail ? ` — ${data.detail}` : '';
                        errEl.textContent = "Warning: " + data.error + detail;
                        errEl.style.display = "block";
                        history.pop();
                    } else {
                        const response = data.response || "";
                        appendMessage("ai", response);
                        history.push({ role: "assistant", content: response });
                    }
                } catch (e) {"""

replacement_code = """                    if (data.error) {
                        const detail = data.detail ? ` — ${data.detail}` : '';
                        errEl.textContent = "Warning: " + data.error + detail;
                        errEl.style.display = "block";
                        history.pop();
                    } else {
                        const response = data.response || "";
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
                        }
                    }
                } catch (e) {"""

if search_code in content:
    content = content.replace(search_code, replacement_code)
    print("PATCHING HTML!")
else:
    print("SEARCH HTML NOT FOUND")

search_code_research = """                    const r = await fetch("/api/chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            message: buildResearchPrompt(topic),
                            history: [],
                        }),
                    });
                    clearInterval(stepInterval);
                    const data = await r.json();
                    if (data.error) throw new Error(data.error);
                    const content = data.response || "";"""

replacement_code_research = """                    const r = await fetch("/api/chat", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            message: buildResearchPrompt(topic),
                            history: [],
                        }),
                    });
                    clearInterval(stepInterval);
                    const data = await r.json();
                    if (data.error) throw new Error(data.error);
                    let content = data.response || "";

                    if (data.thread_events && data.thread_events.length > 0) {
                        const tool_execs = data.thread_events.filter(e => e.type === "tool_execution");
                        if (tool_execs.length > 0) {
                            const query_list = tool_execs.map(e => `- ${e.tool}`).join('\\n');
                            content = content + '\\n\\n## Tool Executions\\n\\n' + query_list;
                        }
                    }"""

if search_code_research in content:
    content = content.replace(search_code_research, replacement_code_research)
    print("PATCHING HTML RESEARCH!")
else:
    print("SEARCH HTML RESEARCH NOT FOUND")

search_code_sched = """                    const data = await r.json();
                    if (data.error)
                        addLogEntry(
                            "err",
                            `"${task.name}" error: ${data.error}`,
                        );
                    else {
                        addLogEntry("ok", `"${task.name}" completed`);
                        const doc = {"""

replacement_code_sched = """                    const data = await r.json();
                    if (data.error)
                        addLogEntry(
                            "err",
                            `"${task.name}" error: ${data.error}`,
                        );
                    else {
                        addLogEntry("ok", `"${task.name}" completed`);
                        if (data.thread_events && data.thread_events.length > 0) {
                            const tool_execs = data.thread_events.filter(e => e.type === "tool_execution");
                            if (tool_execs.length > 0) {
                                for (const exec of tool_execs) {
                                    addLogEntry("ok", `Tool: ${exec.tool}`);
                                }
                            }
                        }
                        const doc = {"""

if search_code_sched in content:
    content = content.replace(search_code_sched, replacement_code_sched)
    print("PATCHING HTML SCHED!")
else:
    print("SEARCH HTML SCHED NOT FOUND")

with open("src/assets/app.html", "w") as f:
    f.write(content)
