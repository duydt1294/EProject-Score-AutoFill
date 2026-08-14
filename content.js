(function () {
    "use strict";

    var CLIPBOARD_KEY = "epsaf_clipboard";

    // =====================================================================
    // Firebase (Realtime Database + Anonymous Auth) — lưu/lấy điểm bài thi
    // cuối môn tạm thời (tự hết hạn sau 2 giờ). Chỉ gọi REST API bằng fetch,
    // không nhúng SDK Firebase để giữ extension nhẹ và dễ debug.
    // FIREBASE_HELPERS_START

    var FIREBASE_CONFIG = {
        apiKey: "AIzaSyDLvN8hIUjI-zDAdg7Rrsl38PsrIBJIBKs",
        databaseURL: "https://fir-99209.firebaseio.com"
    };

    var FIREBASE_TTL_MS = 2 * 60 * 60 * 1000; // 2 giờ

    var firebaseAuthState = { idToken: null, expiresAt: 0 };

    // Đăng nhập ẩn danh (không cần người dùng thao tác gì) và cache token
    // trong bộ nhớ của trang hiện tại — đủ dùng cho cả phiên chấm bài.
    async function ensureFirebaseAuth() {
        if (firebaseAuthState.idToken && Date.now() < firebaseAuthState.expiresAt) {
            return firebaseAuthState.idToken;
        }

        var res = await fetch(
            "https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=" + FIREBASE_CONFIG.apiKey,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ returnSecureToken: true })
            }
        );
        if (!res.ok) {
            throw new Error("Không đăng nhập được Firebase (HTTP " + res.status + ")");
        }
        var data = await res.json();
        if (!data || !data.idToken) {
            throw new Error("Phản hồi đăng nhập Firebase không hợp lệ");
        }

        firebaseAuthState.idToken = data.idToken;
        var expiresInMs = (parseInt(data.expiresIn, 10) || 3600) * 1000;
        // trừ hao 5 phút để không dùng token sát lúc hết hạn
        firebaseAuthState.expiresAt = Date.now() + expiresInMs - 5 * 60 * 1000;
        return firebaseAuthState.idToken;
    }

    // "GAM111.P.1" -> "GAM111"
    function getSubjectCode(rawCode) {
        if (!rawCode) return "";
        var parts = String(rawCode).trim().split(".");
        return parts[0] || "";
    }

    // Realtime Database không cho phép key chứa . # $ [ ] /
    function firebaseSafeKey(str) {
        return String(str || "").replace(/[.#$[\]/]/g, "_");
    }

    function firebaseScorePath(subjectCode, studentCode) {
        return "/examScores/" + firebaseSafeKey(subjectCode) + "/" + firebaseSafeKey(studentCode);
    }

    // Dọn các bản ghi khác đã hết hạn trong cùng mã môn (best-effort, không chặn
    // luồng gửi điểm chính nếu có lỗi) — giúp dữ liệu không nằm lại vô thời hạn
    // chỉ vì không ai bấm "Lấy điểm" đúng bản ghi đó sau khi hết hạn.
    async function pruneExpiredSiblings(subjectCode, token) {
        var listUrl = FIREBASE_CONFIG.databaseURL + "/examScores/" + firebaseSafeKey(subjectCode) + ".json?auth=" + token;
        var res = await fetch(listUrl, { method: "GET" });
        if (!res.ok) return;
        var data = await res.json();
        if (!data) return;

        var now = Date.now();
        var deletions = [];
        Object.keys(data).forEach(function (studentKey) {
            var record = data[studentKey];
            if (record && record.expiresAt && now > record.expiresAt) {
                var delUrl = FIREBASE_CONFIG.databaseURL + "/examScores/" + firebaseSafeKey(subjectCode) + "/" + studentKey + ".json?auth=" + token;
                deletions.push(fetch(delUrl, { method: "DELETE" }).catch(function () {}));
            }
        });
        if (deletions.length) await Promise.all(deletions);
        return deletions.length;
    }

    // payload: { studentCode, subjectCode, scores: {...}, note }
    async function sendScoreToFirebase(payload) {
        var token = await ensureFirebaseAuth();
        var url = FIREBASE_CONFIG.databaseURL + firebaseScorePath(payload.subjectCode, payload.studentCode) + ".json?auth=" + token;

        var now = Date.now();
        var body = {
            studentCode: payload.studentCode,
            subjectCode: payload.subjectCode,
            scores: payload.scores,
            note: payload.note || "",
            updatedAt: now,
            expiresAt: now + FIREBASE_TTL_MS
        };

        var res = await fetch(url, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            throw new Error("Gửi điểm lên Firebase thất bại (HTTP " + res.status + ")");
        }

        // Tiện thể dọn các bản ghi cũ đã hết hạn trong cùng mã môn — chạy nền,
        // không chờ và không làm hỏng kết quả gửi điểm nếu bước dọn dẹp lỗi.
        pruneExpiredSiblings(payload.subjectCode, token).catch(function () {});

        return body;
    }

    // Trả về null nếu chưa từng lưu, hoặc đã lưu quá 2 giờ (và sẽ tự xoá bản ghi cũ đó).
    async function fetchScoreFromFirebase(studentCode, subjectCode) {
        var token = await ensureFirebaseAuth();
        var url = FIREBASE_CONFIG.databaseURL + firebaseScorePath(subjectCode, studentCode) + ".json?auth=" + token;

        var res = await fetch(url, { method: "GET" });
        if (!res.ok) {
            throw new Error("Lấy điểm từ Firebase thất bại (HTTP " + res.status + ")");
        }
        var data = await res.json();
        if (!data) {
            return null;
        }
        if (!data.expiresAt || Date.now() > data.expiresAt) {
            // hết hạn 2 giờ -> coi như không có, dọn luôn bản ghi cũ
            fetch(url, { method: "DELETE" }).catch(function () {});
            return null;
        }
        return data;
    }
    // FIREBASE_HELPERS_END

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
        // Phải có ít nhất 1 ô điểm có data-criteriatype để phân biệt với trang
        // chấm bài thi cuối môn (danh sách tiêu chí phẳng, không chia nhóm).
        return !!document.querySelector(".score-input") && hasCriteriaTypeAttribute();
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

    // =====================================================================
    // Trang duyệt điểm nhóm (role: Chủ tịch hội đồng) — CommitteeChair/CheckIn
    // =====================================================================

    function isChairPage() {
        var ths = document.querySelectorAll("th");
        for (var i = 0; i < ths.length; i++) {
            if (ths[i].textContent.trim() === "Duyệt") return true;
        }
        return false;
    }

    function getChairToken() {
        var form = document.getElementById("__AjaxAntiForgeryForm");
        var input = form
            ? form.querySelector('input[name="__RequestVerificationToken"]')
            : document.querySelector('input[name="__RequestVerificationToken"]');
        return input ? input.value : "";
    }

    // Đọc danh sách sinh viên đang chờ duyệt trực tiếp từ các liên kết "Duyệt điểm"
    // có sẵn trên trang (onclick="Approve(scheduleID, studentID)"), không cần đụng
    // tới hàm JS của trang (chạy ở world khác nên content script không gọi thẳng được).
    function getPendingApprovals() {
        var results = [];
        document.querySelectorAll('a[onclick^="Approve("]').forEach(function (a) {
            var match = /Approve\(\s*(\d+)\s*,\s*(\d+)\s*\)/.exec(a.getAttribute("onclick") || "");
            if (!match) return;
            var row = a.closest("tr");
            var rollNumber = "";
            var fullName = "";
            if (row && row.children && row.children.length > 2) {
                rollNumber = (row.children[1].textContent || "").trim();
                fullName = (row.children[2].textContent || "").trim();
            }
            results.push({
                scheduleID: match[1],
                studentID: match[2],
                rollNumber: rollNumber,
                fullName: fullName
            });
        });
        return results;
    }

    function countApprovedRows() {
        return document.querySelectorAll('.fa-check-circle[title="Đã duyệt"]').length;
    }

    // Gọi thẳng API duyệt điểm (giống hệt request mà nút Duyệt gốc gửi đi),
    // để không phải bật hộp thoại xác nhận riêng cho từng sinh viên.
    async function approveOne(scheduleID, studentID, token) {
        var body = new URLSearchParams();
        body.set("scheduleID", scheduleID);
        body.set("studentID", studentID);
        body.set("__RequestVerificationToken", token);

        var res;
        try {
            res = await fetch("/eproject/api/CommitteeChair/Approve", {
                method: "POST",
                credentials: "same-origin",
                headers: { "X-Requested-With": "XMLHttpRequest" },
                body: body
            });
        } catch (e) {
            return { ok: false, message: "Lỗi kết nối" };
        }

        if (!res.ok) {
            return { ok: false, message: "HTTP " + res.status };
        }

        var data;
        try {
            data = await res.json();
        } catch (e) {
            return { ok: false, message: "Không đọc được phản hồi" };
        }

        if (data && data.codeError === 0) {
            return { ok: true, message: data.data };
        }
        return { ok: false, message: (data && data.data) || "Lỗi không xác định" };
    }

    async function doApproveAll(items, panel) {
        if (!items.length) {
            showToast("Chưa chọn sinh viên nào để duyệt");
            return;
        }

        var token = getChairToken();
        if (!token) {
            showToast("Không tìm thấy token xác thực, thử tải lại trang");
            return;
        }

        var confirmed = window.confirm(
            "Duyệt điểm cho " + items.length + " sinh viên đã chọn?\n" +
            "Thao tác sẽ thực hiện ngay cho tất cả, không hỏi lại từng người."
        );
        if (!confirmed) return;

        var approveBtn = panel.querySelector("#epsaf-approve-all");
        if (approveBtn) approveBtn.disabled = true;

        var successCount = 0;
        var failMessages = [];
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            updateStatus("Đang duyệt " + (i + 1) + "/" + items.length + " — " + (item.rollNumber || item.fullName));
            var result = await approveOne(item.scheduleID, item.studentID, token);
            if (result.ok) {
                successCount++;
            } else {
                failMessages.push((item.rollNumber || item.fullName || "?") + ": " + result.message);
            }
        }

        if (approveBtn) approveBtn.disabled = false;

        var summary = "Đã duyệt " + successCount + "/" + items.length + " sinh viên.";
        if (failMessages.length) {
            summary += "\n\nCác trường hợp lỗi:\n" + failMessages.join("\n");
        }
        window.alert(summary);
        if (successCount > 0) {
            try {
                location.reload();
            } catch (e) {
                // môi trường không hỗ trợ reload (hiếm gặp) — bỏ qua, trạng thái trên trang
                // có thể chưa cập nhật nhưng dữ liệu đã được duyệt thành công phía server.
            }
        }
    }

    function buildChairPanel() {
        var pending = getPendingApprovals();
        var approvedCount = countApprovedRows();

        var listHtml = pending.map(function (item, index) {
            var labelText = (item.rollNumber ? item.rollNumber + " - " : "") + item.fullName;
            return '<label class="epsaf-student-item">' +
                '<input type="checkbox" class="epsaf-student-checkbox" data-index="' + index + '" checked>' +
                "<span>" + escapeHtml(labelText) + "</span>" +
            "</label>";
        }).join("");

        var panel = document.createElement("div");
        panel.id = "epsaf-panel";

        if (!pending.length) {
            panel.innerHTML =
                '<div id="epsaf-header">' +
                    '<span>⚡ Duyệt điểm hàng loạt</span>' +
                    '<button type="button" id="epsaf-toggle" title="Thu gọn / Mở rộng">–</button>' +
                "</div>" +
                '<div id="epsaf-body">' +
                    '<div class="epsaf-secretary-intro">Tất cả sinh viên trong nhóm (' + approvedCount + ') đã được duyệt điểm. Không còn ai đang chờ duyệt.</div>' +
                "</div>";
            document.body.appendChild(panel);
            var toggleBtnDone = panel.querySelector("#epsaf-toggle");
            var bodyDone = panel.querySelector("#epsaf-body");
            toggleBtnDone.addEventListener("click", function () {
                var collapsed = bodyDone.style.display === "none";
                bodyDone.style.display = collapsed ? "" : "none";
                toggleBtnDone.textContent = collapsed ? "–" : "+";
            });
            return;
        }

        panel.innerHTML =
            '<div id="epsaf-header">' +
                '<span>⚡ Duyệt điểm hàng loạt</span>' +
                '<button type="button" id="epsaf-toggle" title="Thu gọn / Mở rộng">–</button>' +
            "</div>" +
            '<div id="epsaf-body">' +
                '<div class="epsaf-secretary-intro">' + approvedCount + ' sinh viên đã duyệt, ' + pending.length + ' sinh viên đang chờ. Chọn người muốn duyệt rồi bấm nút bên dưới — chỉ hỏi xác nhận một lần cho toàn bộ lượt chọn:</div>' +
                '<div id="epsaf-student-list">' + listHtml + "</div>" +
                '<div class="epsaf-select-row">' +
                    '<button type="button" id="epsaf-select-all" class="epsaf-link-btn">Chọn tất cả</button>' +
                    '<button type="button" id="epsaf-select-none" class="epsaf-link-btn">Bỏ chọn tất cả</button>' +
                "</div>" +
                '<button type="button" id="epsaf-approve-all" class="epsaf-fill-btn epsaf-fill-btn-block">✅ Duyệt tất cả sinh viên đã chọn</button>' +
                '<div id="epsaf-status">' + pending.length + ' sinh viên đang chờ duyệt</div>' +
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

        panel.querySelector("#epsaf-approve-all").addEventListener("click", function () {
            var selected = Array.prototype.filter.call(
                panel.querySelectorAll(".epsaf-student-checkbox"),
                function (cb) { return cb.checked; }
            ).map(function (cb) { return pending[parseInt(cb.getAttribute("data-index"), 10)]; });
            doApproveAll(selected, panel);
        });
    }

    // =====================================================================
    // Trang chấm bài thi cuối môn (Proctor/InputScore) — dùng chung domain
    // với hệ thống chấm điểm tốt nghiệp nhưng KHÔNG có data-criteriatype,
    // chỉ có 1 danh sách tiêu chí phẳng với trọng số riêng từng ô.
    // =====================================================================

    function hasCriteriaTypeAttribute() {
        var inputs = document.querySelectorAll(".score-input");
        for (var i = 0; i < inputs.length; i++) {
            if ((inputs[i].getAttribute("data-criteriatype") || "").trim() !== "") return true;
        }
        return false;
    }

    function isFinalExamPage() {
        return !!document.querySelector(".score-input") && !hasCriteriaTypeAttribute();
    }

    function roundToOneExam(value) {
        if (value === null || value === undefined || isNaN(value)) return 0;
        var sign = value < 0 ? -1 : 1;
        var abs = Math.abs(value);
        var rounded = Math.floor(abs * 10 + 0.5 + 1e-8) / 10;
        return rounded * sign;
    }

    // Đọc mã mục (vd "GAM111.P.1") từ cột "Mã mục" (ô thứ 2 trong hàng) của 1 ô điểm.
    function getExamItemCode(input) {
        var row = input.closest("tr");
        if (!row || !row.children || row.children.length < 2) return "";
        return (row.children[1].textContent || "").trim();
    }

    function getExamItems() {
        return Array.prototype.map.call(document.querySelectorAll(".score-input"), function (input) {
            return {
                input: input,
                itemId: input.getAttribute("data-itemid") || "",
                itemCode: getExamItemCode(input),
                weight: parseFloat((input.getAttribute("data-weight") || "0").replace(",", ".")) || 0
            };
        });
    }

    function getExamSubjectCode() {
        var items = getExamItems();
        for (var i = 0; i < items.length; i++) {
            var code = getSubjectCode(items[i].itemCode);
            if (code) return code;
        }
        return "";
    }

    // ---------- Thuật toán chia điểm tổng vào từng ô theo trọng số ----------
    // Ràng buộc: (1) tổng có trọng số (làm tròn 1 chữ số) đúng bằng target;
    // (2) không phải tất cả các ô đều bằng nhau; (3) chênh lệch giữa ô cao nhất
    // và thấp nhất không quá maxSpread. Trả về mảng số điểm (đã làm tròn 1 số
    // thập phân), cùng thứ tự với weights truyền vào.
    function distributeScoreAcrossWeights(target, weights, options) {
        options = options || {};
        var scaleMax = options.scaleMax !== undefined ? options.scaleMax : 10;
        var maxSpread = options.maxSpread !== undefined ? options.maxSpread : 3;
        var n = weights.length;

        if (n === 0) return [];
        var clampedTarget = Math.min(scaleMax, Math.max(0, target));

        if (n === 1) {
            return [roundToOneExam(clampedTarget)];
        }

        var totalWeight = weights.reduce(function (a, b) { return a + b; }, 0) || 100;

        function weightedRoundedTotal(vals) {
            var sum = 0;
            for (var i = 0; i < n; i++) sum += vals[i] * weights[i];
            return roundToOneExam(sum / totalWeight);
        }

        function buildCandidate(spreadBudget) {
            var half = spreadBudget / 2;
            var raw = weights.map(function () {
                return (Math.random() * 2 - 1) * half;
            });
            var wMean = 0;
            for (var i = 0; i < n; i++) wMean += weights[i] * raw[i];
            wMean = wMean / totalWeight;
            var deviations = raw.map(function (d) { return d - wMean; });
            var vals = deviations.map(function (d) {
                return Math.min(scaleMax, Math.max(0, clampedTarget + d));
            });
            return vals.map(roundToOneExam);
        }

        var best = null;
        var bestDiff = Infinity;

        for (var attempt = 0; attempt < 40; attempt++) {
            // giảm dần biên độ dao động ban đầu để nhường chỗ cho bước hiệu chỉnh sau
            var spreadBudget = Math.min(maxSpread, scaleMax) * 0.85;
            var candidate = buildCandidate(spreadBudget);
            candidate = correctToExactTotal(candidate, weights, totalWeight, clampedTarget, scaleMax, maxSpread);

            var achieved = weightedRoundedTotal(candidate);
            var diff = Math.abs(achieved - clampedTarget);
            var spreadOk = (Math.max.apply(null, candidate) - Math.min.apply(null, candidate)) <= maxSpread + 1e-9;
            var varied = new Set(candidate.map(function (v) { return v.toFixed(1); })).size > 1;

            if (diff < bestDiff && spreadOk) {
                best = candidate;
                bestDiff = diff;
            }
            if (diff < 1e-9 && spreadOk && (varied || clampedTarget <= 0 || clampedTarget >= scaleMax)) {
                return candidate;
            }
        }

        return best || weights.map(function () { return roundToOneExam(clampedTarget); });
    }

    // Nudge dần từng bước 0.1 trên ô có trọng số lớn nhất (rồi tới ô kế tiếp nếu
    // không còn dư địa) để tổng có trọng số (đã làm tròn) khớp đúng target.
    function correctToExactTotal(vals, weights, totalWeight, target, scaleMax, maxSpread) {
        var n = vals.length;
        var order = weights
            .map(function (w, i) { return i; })
            .sort(function (a, b) { return weights[b] - weights[a]; });

        function weightedRoundedTotal(v) {
            var sum = 0;
            for (var i = 0; i < n; i++) sum += v[i] * weights[i];
            return roundToOneExam(sum / totalWeight);
        }

        var current = vals.slice();
        var iterations = 0;
        while (iterations < 60) {
            var achieved = weightedRoundedTotal(current);
            var diff = achieved - target;
            if (Math.abs(diff) < 1e-9) break;

            var moved = false;
            for (var oi = 0; oi < order.length; oi++) {
                var idx = order[oi];
                var step = diff > 0 ? -0.1 : 0.1;
                var candidateVal = roundToOneExam(current[idx] + step);
                if (candidateVal < 0 || candidateVal > scaleMax) continue;

                var trial = current.slice();
                trial[idx] = candidateVal;
                var trialSpread = Math.max.apply(null, trial) - Math.min.apply(null, trial);
                if (trialSpread > maxSpread + 1e-9) continue;

                current = trial;
                moved = true;
                break;
            }
            if (!moved) break;
            iterations++;
        }
        return current;
    }

    function fillExamScore(rawTarget) {
        var target = parseNum(rawTarget);
        if (isNaN(target)) {
            showToast("Giá trị không hợp lệ");
            return false;
        }
        target = clamp0to10(target);

        var items = getExamItems().filter(function (it) { return !it.input.disabled; });
        if (!items.length) {
            showToast("Không tìm thấy ô điểm nào trên trang");
            return false;
        }

        var weights = items.map(function (it) { return it.weight; });
        var values = distributeScoreAcrossWeights(target, weights, { scaleMax: 10, maxSpread: 3 });

        items.forEach(function (it, index) {
            setInputValue(it.input, values[index].toFixed(1));
        });

        showToast("Đã điền " + items.length + " ô, tổng ≈ " + target.toFixed(1));
        return true;
    }

    // ---------- Gửi / lấy điểm qua Firebase ----------

    async function sendExamScoreToFirebase(panel) {
        var studentCode = getStudentCode();
        var subjectCode = getExamSubjectCode();
        if (!studentCode || !subjectCode) {
            showToast("Không xác định được mã sinh viên hoặc mã môn trên trang này");
            return;
        }

        var items = getExamItems();
        var scores = {};
        var hasEmpty = false;
        items.forEach(function (it) {
            var raw = (it.input.value || "").trim();
            if (raw === "") { hasEmpty = true; return; }
            var code = it.itemCode || it.itemId;
            // Mã mục dạng "GAM111.P.1" chứa dấu "." — RTDB không cho phép ký tự này
            // trong key (kể cả key lồng bên trong JSON, không riêng gì path URL).
            if (code) scores[firebaseSafeKey(code)] = raw;
        });
        if (hasEmpty) {
            showToast("Còn ô điểm trống — điền đủ trước khi gửi");
            return;
        }

        var generalNoteEl = document.querySelector("#txtGeneralNote");
        updateStatus("Đang gửi điểm lên Firebase...");
        try {
            await sendScoreToFirebase({
                studentCode: studentCode,
                subjectCode: subjectCode,
                scores: scores,
                note: generalNoteEl ? generalNoteEl.value : ""
            });
            updateStatus("Đã gửi điểm SV " + studentCode + " (" + subjectCode + ") lúc " + new Date().toLocaleTimeString());
            showToast("Đã gửi điểm lên Firebase");
        } catch (e) {
            updateStatus("Gửi điểm thất bại: " + e.message);
            showToast("Gửi điểm thất bại: " + e.message);
        }
    }

    async function fetchExamScoreFromFirebase(panel) {
        var studentCode = getStudentCode();
        var subjectCode = getExamSubjectCode();
        if (!studentCode || !subjectCode) {
            showToast("Không xác định được mã sinh viên hoặc mã môn trên trang này");
            return;
        }

        updateStatus("Đang tìm điểm đã lưu trên Firebase...");
        try {
            var data = await fetchScoreFromFirebase(studentCode, subjectCode);
            if (!data) {
                updateStatus("Không tìm thấy điểm đã lưu (chưa gửi hoặc đã quá 2 giờ)");
                showToast("Không tìm thấy điểm đã lưu cho SV này");
                return;
            }

            var items = getExamItems();
            var applied = 0;
            items.forEach(function (it) {
                var code = it.itemCode || it.itemId;
                var safeCode = code ? firebaseSafeKey(code) : "";
                if (safeCode && data.scores && data.scores[safeCode] !== undefined) {
                    setInputValue(it.input, data.scores[safeCode]);
                    applied++;
                }
            });

            var generalNoteEl = document.querySelector("#txtGeneralNote");
            if (generalNoteEl && data.note !== undefined) {
                generalNoteEl.value = data.note;
            }

            updateStatus("Đã lấy điểm SV " + studentCode + " (" + subjectCode + "), khớp " + applied + "/" + items.length + " ô");
            showToast("Đã lấy điểm về (" + applied + " ô)");
        } catch (e) {
            updateStatus("Lấy điểm thất bại: " + e.message);
            showToast("Lấy điểm thất bại: " + e.message);
        }
    }

    function buildExamPanel() {
        var panel = document.createElement("div");
        panel.id = "epsaf-panel";
        panel.innerHTML =
            '<div id="epsaf-header">' +
                '<span>⚡ Auto điền điểm thi</span>' +
                '<button type="button" id="epsaf-toggle" title="Thu gọn / Mở rộng">–</button>' +
            "</div>" +
            '<div id="epsaf-body">' +
                '<div class="epsaf-row">' +
                    '<label>Điểm tổng</label>' +
                    '<input type="text" inputmode="decimal" id="epsaf-exam-target" placeholder="0-10">' +
                    '<button type="button" id="epsaf-exam-fill" class="epsaf-fill-btn">Điền</button>' +
                "</div>" +
                '<div class="epsaf-secretary-intro">Tự động chia điểm vào từng ô theo hệ số sao cho tổng đúng bằng điểm nhập — các ô không bằng nhau và không lệch nhau quá 3 điểm.</div>' +
                '<hr>' +
                '<div class="epsaf-row">' +
                    '<label>Ghi chú</label>' +
                    '<input type="text" id="epsaf-note-text" placeholder="Nội dung ghi chú">' +
                    '<button type="button" id="epsaf-fill-notes" class="epsaf-fill-btn">Điền</button>' +
                "</div>" +
                '<div class="epsaf-secretary-intro">Áp dụng cho tất cả ô ghi chú theo tiêu chí và luôn điền cả vào Ghi chú chung.</div>' +
                '<hr>' +
                '<div class="epsaf-copy-row">' +
                    '<button type="button" id="epsaf-exam-send">📤 Chia sẻ điểm + nhận xét</button>' +
                    '<button type="button" id="epsaf-exam-fetch">📥 Tham khảo điểm + nhận xét</button>' +
                "</div>" +
                '<div id="epsaf-status">Chưa gửi/lấy điểm nào</div>' +
            "</div>";
        document.body.appendChild(panel);

        var body = panel.querySelector("#epsaf-body");
        var toggleBtn = panel.querySelector("#epsaf-toggle");
        toggleBtn.addEventListener("click", function () {
            var collapsed = body.style.display === "none";
            body.style.display = collapsed ? "" : "none";
            toggleBtn.textContent = collapsed ? "–" : "+";
        });

        panel.querySelector("#epsaf-exam-fill").addEventListener("click", function () {
            fillExamScore(document.getElementById("epsaf-exam-target").value);
        });
        document.getElementById("epsaf-exam-target").addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                panel.querySelector("#epsaf-exam-fill").click();
            }
        });

        panel.querySelector("#epsaf-fill-notes").addEventListener("click", function () {
            var text = document.getElementById("epsaf-note-text").value;
            // Trang thi cuối môn: luôn điền cả vào Ghi chú chung, không cần checkbox
            fillAllNotes(text, true);
        });
        document.getElementById("epsaf-note-text").addEventListener("keydown", function (e) {
            if (e.key === "Enter") {
                e.preventDefault();
                panel.querySelector("#epsaf-fill-notes").click();
            }
        });

        panel.querySelector("#epsaf-exam-send").addEventListener("click", function () {
            sendExamScoreToFirebase(panel);
        });
        panel.querySelector("#epsaf-exam-fetch").addEventListener("click", function () {
            fetchExamScoreFromFirebase(panel);
        });
    }

    // ---------- Init ----------

    function init() {
        if (isScorePage()) {
            buildScorePanel();
        } else if (isSecretaryPage()) {
            buildSecretaryPanel();
        } else if (isChairPage()) {
            buildChairPanel();
        } else if (isFinalExamPage()) {
            buildExamPanel();
        }
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
