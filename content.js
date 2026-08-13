(function () {
    "use strict";

    var CLIPBOARD_KEY = "epsaf_clipboard";

    // ---------- Shared helpers ----------

    function parseNum(str) {
        if (str === undefined || str === null) return NaN;
        var s = String(str).trim().replace(",", ".");
        if (s === "") return NaN;
        return parseFloat(s);
    }

    function clamp0to10(n) {
        return Math.min(10, Math.max(0, n));
    }

    function setInputValue(input, value) {
        input.value = value;
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function escapeHtml(value) {
        if (value === null || value === undefined) return "";
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

    var toastTimer = null;
    function showToast(msg) {
        var toast = document.getElementById("epsaf-toast");
        if (!toast) {
            toast = document.createElement("div");
            toast.id = "epsaf-toast";
            document.body.appendChild(toast);
        }
        toast.textContent = msg;
        toast.classList.add("epsaf-toast-show");
        if (toastTimer) clearTimeout(toastTimer);
        toastTimer = setTimeout(function () {
            toast.classList.remove("epsaf-toast-show");
        }, 2200);
    }

    function updateStatus(text) {
        var el = document.getElementById("epsaf-status");
        if (el) el.textContent = text;
    }

    // =====================================================================
    // Trang chấm điểm chi tiết (role: Ủy viên) — CommitteeMember/InputScore
    // =====================================================================

    function isScorePage() {
        return !!document.querySelector(".score-input");
    }

    function getStudentCode() {
        var ths = document.querySelectorAll("th");
        for (var i = 0; i < ths.length; i++) {
            if (ths[i].textContent.trim() === "Mã sinh viên") {
                var td = ths[i].nextElementSibling;
                return td ? td.textContent.trim() : "";
            }
        }
        return "";
    }

    // ---------- Nhận diện động các nhóm tiêu chí trên phiếu ----------
    // Không hardcode TAILIEUDUAN/NHOM/CANHAN — đọc trực tiếp từ data-criteriatype
    // của các ô điểm đang có trên trang, để khi trường/môn đổi bộ tiêu chí
    // (đổi tên nhóm, thêm/bớt nhóm...) panel vẫn tự bắt kịp mà không cần sửa code.

    function deriveGroupLabel(inp, type) {
        var row = inp.closest("tr");
        if (row && row.children && row.children.length > 2) {
            var nameCell = row.children[2]; // cột "Tên tiêu chí"
            var text = (nameCell.textContent || "").trim();
            var dashIdx = text.indexOf(" - ");
            if (dashIdx > 0) {
                return text.substring(0, dashIdx).trim();
            }
        }
        // fallback: viết hoa chữ cái đầu của mã tiêu chí thô, ví dụ TAILIEUDUAN -> Tailieuduan
        if (!type) return "Khác";
        return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
    }

    function getScoreGroups() {
        var order = [];
        var groupsByType = {};
        document.querySelectorAll(".score-input").forEach(function (inp) {
            var type = (inp.getAttribute("data-criteriatype") || "").trim();
            if (!type) return;
            if (!groupsByType[type]) {
                groupsByType[type] = { type: type, label: deriveGroupLabel(inp, type), count: 0 };
                order.push(type);
            }
            groupsByType[type].count++;
        });
        return order.map(function (type) { return groupsByType[type]; });
    }

    // ---------- Group auto-fill ----------

    function fillGroup(type, rawValue) {
        var num = parseNum(rawValue);
        if (isNaN(num)) {
            showToast("Giá trị không hợp lệ");
            return false;
        }
        num = clamp0to10(num);
        var formatted = num.toFixed(1);
        var inputs = Array.prototype.filter.call(
            document.querySelectorAll(".score-input"),
            function (inp) { return (inp.getAttribute("data-criteriatype") || "").trim() === type; }
        );
        if (!inputs.length) {
            showToast("Không tìm thấy nhóm điểm này trên trang");
            return false;
        }
        inputs.forEach(function (inp) {
            if (inp.disabled) return;
            setInputValue(inp, formatted);
        });
        showToast("Đã điền " + inputs.length + " ô, TB = " + formatted);
        return true;
    }

    // ---------- Điền ghi chú hàng loạt (từng tiêu chí trong 1 phiếu) ----------

    function fillAllNotes(text, includeGeneral) {
        var noteInputs = document.querySelectorAll(".note-input");
        if (!noteInputs.length && !includeGeneral) {
            showToast("Không tìm thấy ô ghi chú nào trên trang");
            return false;
        }
        noteInputs.forEach(function (inp) {
            if (inp.disabled) return;
            inp.value = text;
            inp.dispatchEvent(new Event("input", { bubbles: true }));
            inp.dispatchEvent(new Event("change", { bubbles: true }));
        });

        var applied = noteInputs.length;
        if (includeGeneral) {
            var generalNoteEl = document.querySelector("#txtGeneralNote");
            if (generalNoteEl && !generalNoteEl.disabled) {
                generalNoteEl.value = text;
                generalNoteEl.dispatchEvent(new Event("input", { bubbles: true }));
                generalNoteEl.dispatchEvent(new Event("change", { bubbles: true }));
                applied++;
            }
        }

        showToast("Đã điền ghi chú cho " + applied + " ô");
        return true;
    }

    // ---------- Copy / Paste giữa các sinh viên ----------

    function collectScores() {
        var data = {};
        document.querySelectorAll(".score-input").forEach(function (inp) {
            var id = inp.getAttribute("data-itemid");
            if (id) data[id] = inp.value;
        });
        return data;
    }

    function collectNotes() {
        var notes = {};
        document.querySelectorAll(".note-input").forEach(function (inp) {
            var id = (inp.id || "").replace("txtNote_", "");
            if (id) notes[id] = inp.value;
        });
        return notes;
    }

    function copyScores() {
        var generalNoteEl = document.querySelector("#txtGeneralNote");
        var payload = {
            studentCode: getStudentCode(),
            scores: collectScores(),
            notes: collectNotes(),
            generalNote: generalNoteEl ? generalNoteEl.value : "",
            savedAt: Date.now()
        };
        chrome.storage.local.set({ epsaf_clipboard: payload }, function () {
            updateStatus("Đã copy điểm + ghi chú từ SV " + (payload.studentCode || "?"));
            showToast("Đã copy điểm và ghi chú");
        });
    }

    function pasteScores() {
        chrome.storage.local.get(CLIPBOARD_KEY, function (res) {
            var payload = res[CLIPBOARD_KEY];
            if (!payload) {
                showToast("Chưa có điểm nào được copy");
                return;
            }

            var applied = 0;
            document.querySelectorAll(".score-input").forEach(function (inp) {
                if (inp.disabled) return;
                var id = inp.getAttribute("data-itemid");
                if (id && payload.scores && payload.scores[id] !== undefined) {
                    setInputValue(inp, payload.scores[id]);
                    applied++;
                }
            });

            if (payload.notes) {
                document.querySelectorAll(".note-input").forEach(function (inp) {
                    var id = (inp.id || "").replace("txtNote_", "");
                    if (id && payload.notes[id] !== undefined) {
                        inp.value = payload.notes[id];
                    }
                });
            }

            var generalNoteEl = document.querySelector("#txtGeneralNote");
            if (generalNoteEl && payload.generalNote !== undefined) {
                generalNoteEl.value = payload.generalNote;
            }

            showToast("Đã dán điểm + ghi chú (" + applied + " mục) từ SV " + (payload.studentCode || "?"));
        });
    }

    function refreshScoreStatusFromStorage() {
        chrome.storage.local.get(CLIPBOARD_KEY, function (res) {
            var payload = res[CLIPBOARD_KEY];
            if (payload) {
                var d = new Date(payload.savedAt);
                updateStatus(
                    "Đã copy từ SV " + (payload.studentCode || "?") +
                    " lúc " + d.toLocaleTimeString()
                );
            } else {
                updateStatus("Chưa copy điểm nào");
            }
        });
    }

    function buildScorePanel() {
        var groups = getScoreGroups();
        var groupsHtml = groups.map(function (g, index) {
            var inputId = "epsaf-group-" + index;
            return '<div class="epsaf-row epsaf-score-row">' +
                '<label title="' + escapeHtml(g.label + " (" + g.type + ")") + '">' + escapeHtml(g.label) + '</label>' +
                '<input type="text" inputmode="decimal" id="' + inputId + '" placeholder="0-10">' +
                '<button type="button" class="epsaf-fill-btn" data-type="' + escapeHtml(g.type) + '" data-input="' + inputId + '">Điền</button>' +
            "</div>";
        }).join("");

        var panel = document.createElement("div");
        panel.id = "epsaf-panel";
        panel.innerHTML =
            '<div id="epsaf-header">' +
                '<span>⚡ Auto điền điểm</span>' +
                '<button type="button" id="epsaf-toggle" title="Thu gọn / Mở rộng">–</button>' +
            "</div>" +
            '<div id="epsaf-body">' +
                '<div id="epsaf-score-groups">' + groupsHtml + "</div>" +
                (groups.length ? "" : '<div class="epsaf-secretary-intro">Không phát hiện được nhóm tiêu chí nào trên phiếu này.</div>') +
                '<div class="epsaf-row">' +
                    '<label>Ghi chú</label>' +
                    '<input type="text" id="epsaf-note-text" placeholder="Nội dung ghi chú">' +
                    '<button type="button" id="epsaf-fill-notes" class="epsaf-fill-btn">Điền</button>' +
                "</div>" +
                '<label class="epsaf-checkbox-label">' +
                    '<input type="checkbox" id="epsaf-note-include-general"> Áp dụng cho cả Ghi chú chung' +
                "</label>" +
                '<button type="button" id="epsaf-fill-all">Điền tất cả (điểm + ghi chú)</button>' +
                '<hr>' +
                '<div class="epsaf-copy-row">' +
                    '<button type="button" id="epsaf-copy">📋 Copy điểm + ghi chú SV này</button>' +
                    '<button type="button" id="epsaf-paste">📥 Dán điểm + ghi chú vào SV này</button>' +
                "</div>" +
                '<div id="epsaf-status">Chưa copy điểm nào</div>' +
            "</div>";
        document.body.appendChild(panel);

        // Toggle collapse
        var body = panel.querySelector("#epsaf-body");
        var toggleBtn = panel.querySelector("#epsaf-toggle");
        toggleBtn.addEventListener("click", function () {
            var collapsed = body.style.display === "none";
            body.style.display = collapsed ? "" : "none";
            toggleBtn.textContent = collapsed ? "–" : "+";
        });

        // Per-group score fill buttons (ghi chú có nút Điền riêng, xử lý bên dưới)
        panel.querySelectorAll(".epsaf-score-row .epsaf-fill-btn").forEach(function (btn) {
            btn.addEventListener("click", function () {
                var type = btn.getAttribute("data-type");
                var inputId = btn.getAttribute("data-input");
                var val = document.getElementById(inputId).value;
                fillGroup(type, val);
            });
        });

        // Enter key inside group score inputs triggers fill
        panel.querySelectorAll(".epsaf-score-row input").forEach(function (input) {
            input.addEventListener("keydown", function (e) {
                if (e.key === "Enter") {
                    e.preventDefault();
                    var row = input.closest(".epsaf-row");
                    row.querySelector(".epsaf-fill-btn").click();
                }
            });
        });

        // Bulk note fill
        panel.querySelector("#epsaf-fill-notes").addEventListener("click", function () {
            var text = document.getElementById("epsaf-note-text").value;
            var includeGeneral = document.getElementById("epsaf-note-include-general").checked;
            fillAllNotes(text, includeGeneral);
        });
        document.getElementById("epsaf-note-text").addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                panel.querySelector("#epsaf-fill-notes").click();
            }
        });

        // Điền tất cả các nhóm điểm đã phát hiện + ghi chú cùng lúc (bỏ qua ô nào để trống)
        panel.querySelector("#epsaf-fill-all").addEventListener("click", function () {
            var any = false;
            groups.forEach(function (g, index) {
                var val = document.getElementById("epsaf-group-" + index).value;
                if (val !== undefined && val.trim() !== "") {
                    any = fillGroup(g.type, val) || any;
                }
            });

            var noteText = document.getElementById("epsaf-note-text").value;
            if (noteText !== undefined && noteText.trim() !== "") {
                var includeGeneral = document.getElementById("epsaf-note-include-general").checked;
                any = fillAllNotes(noteText, includeGeneral) || any;
            }

            if (!any) showToast("Chưa nhập điểm hoặc ghi chú nào để điền");
        });

        panel.querySelector("#epsaf-copy").addEventListener("click", copyScores);
        panel.querySelector("#epsaf-paste").addEventListener("click", pasteScores);

        refreshScoreStatusFromStorage();
    }

    // =====================================================================
    // Trang tổng hợp điểm nhóm (role: Thư ký hội đồng) — CommitteeSecretary/CheckIn
    // =====================================================================

    function isSecretaryPage() {
        return !!document.querySelector(".secretary-checkout-status[data-refresh-id]");
    }

    function getSecretaryStudentRows() {
        return Array.prototype.map.call(
            document.querySelectorAll(".secretary-checkout-status[data-refresh-id]"),
            function (div) {
                return {
                    id: div.getAttribute("data-refresh-id") || "",
                    rollNumber: div.getAttribute("data-roll-number") || "",
                    fullName: div.getAttribute("data-full-name") || "",
                    no: div.getAttribute("data-no") || ""
                };
            }
        ).filter(function (r) { return r.id; });
    }

    function fillSecretaryNotes(text, ids) {
        var applied = 0;
        ids.forEach(function (id) {
            var textarea = document.getElementById("txtAreaCheckOut_" + id);
            if (!textarea || textarea.disabled) return;
            textarea.value = text;
            textarea.dispatchEvent(new Event("input", { bubbles: true }));
            textarea.dispatchEvent(new Event("change", { bubbles: true }));
            applied++;
        });

        if (applied === 0) {
            showToast("Chưa chọn sinh viên nào để điền");
        } else {
            showToast("Đã điền ghi chú cho " + applied + " sinh viên. Nhớ bấm Save từng dòng để lưu.");
        }
        return applied;
    }

    // Gợi ý nội dung chung chung cho các ô nhận xét bắt buộc của hội đồng —
    // chỉ để có sẵn ý tưởng ban đầu, người dùng cần đọc lại và chỉnh sửa
    // cho đúng với từng đề tài trước khi lưu.
    var SECRETARY_NOTE_TEMPLATES = {
        ResearchNote: "Đề tài thể hiện tính nghiên cứu ở mức tìm hiểu, phân tích và lựa chọn giải pháp/công nghệ phù hợp với bài toán đặt ra. Nhóm có tham khảo tài liệu liên quan trước khi triển khai.",
        ApplicationNote: "Sản phẩm có khả năng ứng dụng thực tế, giải quyết được nhu cầu cụ thể mà đề tài đặt ra và có thể tiếp tục mở rộng, triển khai thêm trong môi trường thực tế.",
        StrengthNote: "Nhóm nắm được kiến thức nền tảng liên quan đến đề tài, trình bày rõ ràng, sản phẩm hoạt động ổn định và đáp ứng được các chức năng chính đã đề ra.",
        WeaknessNote: "Một số chức năng còn cần tối ưu thêm, tài liệu/báo cáo chưa thực sự chi tiết ở một số phần, cần bổ sung thêm test case và xử lý các trường hợp ngoại lệ.",
        ConclusionNote: "Đề tài đáp ứng yêu cầu của một khoá luận/đồ án tốt nghiệp. Đề nghị nhóm tiếp tục hoàn thiện các hạn chế đã nêu để có thể triển khai hoặc mở rộng thêm trong tương lai."
    };

    function fillSuggestedCommitteeNotes(overwrite) {
        var applied = 0;
        var skipped = 0;
        Object.keys(SECRETARY_NOTE_TEMPLATES).forEach(function (id) {
            var el = document.getElementById(id);
            if (!el || el.disabled) return;
            if (!overwrite && el.value && el.value.trim() !== "") {
                skipped++;
                return;
            }
            el.value = SECRETARY_NOTE_TEMPLATES[id];
            el.dispatchEvent(new Event("input", { bubbles: true }));
            el.dispatchEvent(new Event("change", { bubbles: true }));
            applied++;
        });

        if (applied === 0 && skipped > 0) {
            showToast("Các ô đã có nội dung, tick \"Ghi đè\" nếu muốn thay thế");
        } else if (applied === 0) {
            showToast("Không tìm thấy ô nhận xét hội đồng trên trang này");
        } else {
            showToast("Đã điền gợi ý cho " + applied + " ô nhận xét — nhớ đọc lại và chỉnh sửa cho đúng đề tài");
        }
        return applied;
    }

    function buildSecretaryPanel() {
        var rows = getSecretaryStudentRows();
        if (!rows.length) return;

        var listHtml = rows.map(function (r) {
            var labelText = (r.no ? r.no + ". " : "") + r.rollNumber + " - " + r.fullName;
            return '<label class="epsaf-student-item">' +
                '<input type="checkbox" class="epsaf-student-checkbox" value="' + escapeHtml(r.id) + '" checked>' +
                "<span>" + escapeHtml(labelText) + "</span>" +
            "</label>";
        }).join("");

        var panel = document.createElement("div");
        panel.id = "epsaf-panel";
        panel.innerHTML =
            '<div id="epsaf-header">' +
                '<span>⚡ Ghi chú hàng loạt</span>' +
                '<button type="button" id="epsaf-toggle" title="Thu gọn / Mở rộng">–</button>' +
            "</div>" +
            '<div id="epsaf-body">' +
                '<div class="epsaf-secretary-intro">Chọn sinh viên trong nhóm rồi nhập nội dung để điền hàng loạt vào ô "Ghi chú nộp bài":</div>' +
                '<div id="epsaf-student-list">' + listHtml + "</div>" +
                '<div class="epsaf-select-row">' +
                    '<button type="button" id="epsaf-select-all" class="epsaf-link-btn">Chọn tất cả</button>' +
                    '<button type="button" id="epsaf-select-none" class="epsaf-link-btn">Bỏ chọn tất cả</button>' +
                "</div>" +
                '<textarea id="epsaf-secretary-note-text" rows="3" placeholder="Nội dung ghi chú nộp bài..."></textarea>' +
                '<button type="button" id="epsaf-secretary-fill" class="epsaf-fill-btn epsaf-fill-btn-block">Điền cho SV đã chọn</button>' +
                '<hr>' +
                '<div class="epsaf-secretary-intro">Điền sẵn nội dung gợi ý (chung chung) cho 5 ô nhận xét bắt buộc của hội đồng để có ý tưởng, bạn nên đọc lại và chỉnh sửa cho đúng đề tài trước khi lưu:</div>' +
                '<label class="epsaf-checkbox-label">' +
                    '<input type="checkbox" id="epsaf-note-overwrite"> Ghi đè nội dung đã có' +
                "</label>" +
                '<button type="button" id="epsaf-fill-committee-notes" class="epsaf-fill-btn epsaf-fill-btn-block">💡 Điền gợi ý nhận xét hội đồng</button>' +
                '<div id="epsaf-status">' + rows.length + ' sinh viên trong nhóm</div>' +
            "</div>";
        document.body.appendChild(panel);

        var body = panel.querySelector("#epsaf-body");
        var toggleBtn = panel.querySelector("#epsaf-toggle");
        toggleBtn.addEventListener("click", function () {
            var collapsed = body.style.display === "none";
            body.style.display = collapsed ? "" : "none";
            toggleBtn.textContent = collapsed ? "–" : "+";
        });

        panel.querySelector("#epsaf-select-all").addEventListener("click", function () {
            panel.querySelectorAll(".epsaf-student-checkbox").forEach(function (cb) { cb.checked = true; });
        });
        panel.querySelector("#epsaf-select-none").addEventListener("click", function () {
            panel.querySelectorAll(".epsaf-student-checkbox").forEach(function (cb) { cb.checked = false; });
        });

        function doFill() {
            var text = panel.querySelector("#epsaf-secretary-note-text").value;
            if (!text || !text.trim()) {
                showToast("Chưa nhập nội dung ghi chú");
                return;
            }
            var ids = Array.prototype.filter.call(
                panel.querySelectorAll(".epsaf-student-checkbox"),
                function (cb) { return cb.checked; }
            ).map(function (cb) { return cb.value; });
            fillSecretaryNotes(text, ids);
        }

        panel.querySelector("#epsaf-secretary-fill").addEventListener("click", doFill);

        // Ctrl+Enter (hoặc Cmd+Enter) trong textarea để điền nhanh, không chặn Enter xuống dòng
        panel.querySelector("#epsaf-secretary-note-text").addEventListener("keydown", function (e) {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                doFill();
            }
        });

        panel.querySelector("#epsaf-fill-committee-notes").addEventListener("click", function () {
            var overwrite = panel.querySelector("#epsaf-note-overwrite").checked;
            fillSuggestedCommitteeNotes(overwrite);
        });
    }

    // ---------- Init ----------

    function init() {
        if (isScorePage()) {
            buildScorePanel();
        } else if (isSecretaryPage()) {
            buildSecretaryPanel();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
