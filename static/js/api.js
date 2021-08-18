//? |-----------------------------------------------------------------------------------------------|
//? |  /static/js/api.js                                                                            |
//? |                                                                                               |
//? |  Copyright (c) 2021 Belikhun. All right reserved                                              |
//? |  Licensed under the MIT License. See LICENSE in the project root for license information.     |
//? |-----------------------------------------------------------------------------------------------|

/**
 * This object contains CTMS api used to communicate
 * with the CTMS backend
 * 
 * Because CTMS don't have a proper api endpoint so we will need
 * to crawl the data from the response html, which will require
 * converting raw html into dom object
 * 
 * To minimize API call and reduce load on CTMS's server, we designed
 * a event-based api call. Which mean anything that need a certain data
 * from a specific api an register a listener that will be called
 * when the request is complete. You can register your listener with
 * `api.onResponse(<type>, <listener>)`
 * 
 * @author	Belikhun
 * @version	1.0
 */
const api = {
	HOST: `http://ctms.fithou.net.vn`,
	MIDDLEWARE: `http://localhost`,

	__PATH: undefined,

	/**
	 * Store Current Viewstate
	 * @type {String}
	 */
	__VIEWSTATE: undefined,

	/**
	 * Store Current Viewstate Generator
	 * @type {String}
	 */
	__VIEWSTATEGENERATOR: undefined,

	/**
	 * Store Validator String to validate user event (idk)
	 * @type {String}
	 */
	__EVENTVALIDATION: undefined,

	responseHandlers: {},

	onResponse(type, f) {
		if (typeof f !== "function")
			throw { code: -1, description: `api.onResponse(${type}): not a valid function` }

		if (this.responseHandlers[type] === null || typeof this.responseHandlers[type] !== "object")
			this.responseHandlers[type] = []

		this.responseHandlers[type].push(f);
	},

	__handleResponse(type, data) {
		if (this.responseHandlers[type] === null || typeof this.responseHandlers[type] !== "object" || this.responseHandlers[type].length === 0) {
			clog("WARN", `api.__handleResponse(${type}): no handler found`);
			return;
		}

		this.responseHandlers[type].forEach(f => f(data));
	},

	async request({
		path = "",
		method = "GET",
		query,
		form,
		json,
		header = {},
		target = "",
		argument = "",
		renewSession = false,
		ignoreAnnouncement = false
	} = {}) {
		if (method === "POST") {
			form.__EVENTTARGET = target;
			form.__EVENTARGUMENT = argument;

			if (this.__VIEWSTATE && !form.__VIEWSTATE) {
				form.__VIEWSTATE = this.__VIEWSTATE;
				form.__VIEWSTATEGENERATOR = this.__VIEWSTATEGENERATOR;
				form.__EVENTVALIDATION = this.__EVENTVALIDATION;
			}
		}
		
		this.__PATH = path;
		let start = new StopClock();
		let response;
		
		try {
			response = await myajax({
				url: `${this.MIDDLEWARE}/api/middleware`,
				method,
				header: {
					"Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
					"Session-Cookie-Key": "ASP.NET_SessionId",
					"Session-Cookie-Value": localStorage.getItem("session") || "",
					"Set-Host": "ctms.fithou.net.vn",
					"Set-Origin": this.HOST,
					"Set-Referer": `${this.HOST}${path}`,
					"Upgrade-Insecure-Requests": 1,
					...header
				},
				query: {
					url: `${this.HOST}${path}`,
					...query
				},
				form,
				json,
				withCredentials: true,
				formEncodeURL: true
			});
		} catch(error) {
			if (error.data) {
				error.c2m = start.tick() - error.data.runtime;
				this.__handleResponse("error", error);

				// Check maintain mode
				if (error.data.status === 503 && error.data.data && error.data.data.response) {
					let dom = document.createElement("template");
					dom.innerHTML = error.data.data.response;

					throw { code: -1, description: `api.request(): CTMS đang bảo trì!`, data: {
						code: -1,
						description: dom.content.querySelector("h1").innerText
					}}
				}
	
				throw error;
			} else {
				error.c2m = start.tick();
				this.__handleResponse("error", error);
				throw { code: -1, description: `api.request(): invalid middleware response (middleware: ${this.MIDDLEWARE})`, data: error }
			}
		}

		if (response.data.session) {
			clog("DEBG", "api.request(): session", { text: response.data.session, color: oscColor("blue") });
			localStorage.setItem("session", response.data.session);
		}

		let dom = document.createElement("template");
		dom.innerHTML = response.data.response;

		// Check No Permission Page
		if (dom.content.querySelector(".NoPermission")) {
			if (!renewSession)
				throw { code: -1, description: `Phiên làm việc hết hạn hoặc bạn không có quyền truy cập chức năng này!` }

			clog("WARN", `api.request(): session expired! requesting new session`);
			localStorage.setItem("session", "");
			return await this.request(arguments[0]);
		}

		let __vs = dom.content.getElementById("__VIEWSTATE");
		let __vsg = dom.content.getElementById("__VIEWSTATEGENERATOR");
		let __ev = dom.content.getElementById("__EVENTVALIDATION");

		if (__vs && __vs.value !== "") {
			clog("DEBG", `api.request(): update __VIEWSTATE`, { text: truncateString(__vs.value, 60), color: oscColor("pink") });
			this.__VIEWSTATE = __vs.value;
		}

		if (__vsg && __vsg.value !== "") {
			clog("DEBG", `api.request(): update __VIEWSTATEGENERATOR`, { text: __vsg.value, color: oscColor("pink") });
			this.__VIEWSTATEGENERATOR = __vsg.value;
		}

		if (__ev && __ev.value !== "") {
			clog("DEBG", `api.request(): update __EVENTVALIDATION`, { text: __ev.value, color: oscColor("pink") });
			this.__EVENTVALIDATION = __ev.value;
		}

		// Update logout state for home page
		if (path === "" || path === "/") {
			this.__LOGOUT_VIEWSTATE = this.__VIEWSTATE;
			this.__LOGOUT_VIEWSTATEGENERATOR = this.__VIEWSTATEGENERATOR;
		}

		// Check for forced change password
		if (dom.content.getElementById("LeftCol_UsersChangePassword1_lblUser"))
			throw { code: -1, description: `api.request(): CTMS yêu cầu bạn thay đổi mật khẩu, vui lòng thực hiện hành động này trên trang chủ của CTMS` }

		// Check for announcement
		if (!ignoreAnnouncement) {
			let ann = dom.content.getElementById("thongbao");
			if (ann) {
				await popup.show({
					windowTitle: "Thông Báo",
					title: "Thông Báo",
					icon: "horn",
					bgColor: "blue",
					message: `api.request`,
					description: `${method} ${path}`,
					customNode: ann,
					buttonList: {
						close: { text: "ĐÓNG", color: "blue" }
					}
				});
			}
		}

		let data = {
			dom: dom.content,
			c2m: start.tick() - response.runtime,
			...response.data
		}

		this.__handleResponse("global", data);
		return data;
	},

	/**
	 * Đăng nhập vào CTMS với tài khoản và mật khẩu được đưa vào
	 * 
	 * @param	{Object} param0
	 * Bao gồm 2 giá trị
	 *  + **String** `username`: Tên người dùng/email
	 *  + **String** `password`: Mật khẩu
	 */
	async login({
		username,
		password
	} = {}) {
		if (typeof username !== "string" || typeof password !== "string")
			throw { code: -1, description: `api.login(): invalid username or password` }

		let response = await this.request({
			path: "/login.aspx",
			method: "POST",
			form: {
				ctl00$LeftCol$UserLogin1$txtUsername: username,
				ctl00$LeftCol$UserLogin1$txtPassword: md5(password),
				ctl00$LeftCol$UserLogin1$btnLogin: "Đăng nhập"
			}
		});

		this.__handleResponse("login", response);
		return response;
	},

	// States used to perform logout call
	__LOGOUT_VIEWSTATE: undefined,
	__LOGOUT_VIEWSTATEGENERATOR: undefined,

	/**
	 * Đăng xuất khỏi tài khoản hiện tại
	 */
	async logout() {
		if (!this.__LOGOUT_VIEWSTATE || !this.__LOGOUT_VIEWSTATEGENERATOR)
			throw { code: -1, description: `api.logout(): cannot perform a logout without viewstate data` }

		let response = await this.request({
			method: "POST",
			form: {
				...this.__LOGOUT_FORM,
				__VIEWSTATE: this.__LOGOUT_VIEWSTATE,
				__VIEWSTATEGENERATOR: this.__LOGOUT_VIEWSTATEGENERATOR,
				__EVENTVALIDATION: this.__LOGOUT_EVENTVALIDATION,
				"__CALLBACKID": "ctl00$QuanlyMenu1",
				"__CALLBACKPARAM": "logout"
			}
		});

		this.reset();
		this.__handleResponse("logout", response);

		return response;
	},

	/**
	 * Chuyển điểm hệ số 10 sang hệ số 4 và xếp loại
	 * @param {Number} average 
	 */
	resultGrading(average) {
		let point = 0;
		let letter = "?";

		if (average >= 9.0) {
			point = 4.0;
			letter = "A+";
		} else if (average >= 8.5) {
			point = 4.0;
			letter = "A";
		} else if (average >= 8.0) {
			point = 3.5;
			letter = "B+";
		} else if (average >= 7.0) {
			point = 3.0;
			letter = "B";
		} else if (average >= 6.5) {
			point = 2.5;
			letter = "C+";
		} else if (average >= 5.5) {
			point = 2.0;
			letter = "C";
		} else if (average >= 5.0) {
			point = 1.5;
			letter = "D+";
		} else if (average >= 4.0) {
			point = 1.0;
			letter = "D";
		} else {
			point = 0;
			letter = "F";
		}

		return { point, letter }
	},

	/**
	 * Lấy kết quả học tập của sinh viên kèm theo thông tin cơ bản
	 */
	async results() {
		let response = await this.request({
			path: "/KetquaHoctap.aspx",
			method: "GET"
		});

		response.info = {
			name: response.dom.querySelector(`#leftcontent > table.ThongtinSV > tbody > tr:nth-child(1) > td:nth-child(2)`).innerText.replace(":\n", "").trim().replace("  ", " "),
			birthday: response.dom.querySelector(`#leftcontent > table.ThongtinSV > tbody > tr:nth-child(1) > td:nth-child(4)`).innerText.replace(":\n", "").trim().replace("  ", " "),
			tForm: response.dom.querySelector(`#leftcontent > table.ThongtinSV > tbody > tr:nth-child(2) > td:nth-child(2)`).innerText.replace(":\n", "").trim().replace("  ", " "),
			studentID: response.dom.querySelector(`#leftcontent > table.ThongtinSV > tbody > tr:nth-child(2) > td:nth-child(4)`).innerText.replace(":\n", "").trim().replace("  ", " "),
			faculty: response.dom.querySelector(`#leftcontent > table.ThongtinSV > tbody > tr:nth-child(3) > td:nth-child(2)`).innerText.replace(":\n", "").trim().replace("  ", " "),
			department: response.dom.querySelector(`#leftcontent > table.ThongtinSV > tbody > tr:nth-child(3) > td:nth-child(4)`).innerText.replace(":\n", "").trim().replace("  ", " "),
			course: response.dom.querySelector(`#leftcontent > table.ThongtinSV > tbody > tr:nth-child(4) > td:nth-child(2)`).innerText.replace(":\n", "").trim().replace("  ", " "),
			classroom: response.dom.querySelector(`#leftcontent > table.ThongtinSV > tbody > tr:nth-child(4) > td:nth-child(4)`).innerText.replace(":\n", "").trim().replace("  ", " "),
			mode: response.dom.getElementById("leftcontent").childNodes.item(2).wholeText.trim().replace("\n", " "),
			results: [],
			cpa: 0,
			grade: "Yếu"
		}

		let resultTableRows = [ ...response.dom.querySelectorAll(`#leftcontent > table.RowEffect.CenterElement > tbody > tr`) ]
		
		let totalGrade = 0;
		let totalCredits = 0;
		let __procPoint = (node) => {
			let v = node.innerText.trim();

			if (v === "")
				return undefined;

			return (v === "?")
				? "?"
				: parseFloat(v);
		}

		for (let row of resultTableRows) {
			let data = {
				subject: row.children[0].innerText.trim(),
				credits: parseInt(row.children[1].innerText.trim()),
				classID: row.children[2].innerText.trim(),
				teacher: row.children[3].innerText.trim(),
				diemCC: __procPoint(row.children[4]),
				diemDK: __procPoint(row.children[5]),
				diemHK: __procPoint(row.children[6]),
				average: undefined,
				grade: undefined,

				// We will add note later as currently we don't
				// know what kind of data goes in here
				// note: row.children[7].innerText.trim()
			}

			if (typeof data.diemCC === "number" && typeof data.diemDK === "number" && typeof data.diemHK === "number") {
				data.average = data.diemCC * 0.1 + data.diemDK * 0.2 + data.diemHK * 0.7;
				data.grade = this.resultGrading(data.average);
				totalGrade += data.grade.point * data.credits;
				totalCredits += data.credits;
			}

			response.info.results.push(data);
		}

		response.info.cpa = totalGrade / totalCredits;

		if (response.info.cpa >= 3.6)
			response.info.grade = "Xuất Xắc"
		else if (response.info.cpa >= 3.2)
			response.info.grade = "Giỏi"
		else if (response.info.cpa >= 2.5)
			response.info.grade = "Khá"
		else if (response.info.cpa >= 2)
			response.info.grade = "Trung Bình"
		else
			response.info.grade = "Yếu"

		this.__handleResponse("results", response);
		return response;
	},

	/**
	 * Lấy danh sách dịch vụ và tình trạng đăng kí các dịch vụ
	 */
	async services() {
		let response = await this.request({
			path: "/services/BuyServices.aspx",
			method: "GET"
		});

		let dvList = [ ...response.dom.querySelectorAll("div.dichvu") ]
			.map(e => {
				let s = e.children[2]

				if (s && s.title !== "") {
					let t = s.title
						.substring(1, s.title.length - 1)
						.split("-")
						.map(i => {
							let t = /(\d+)\/(\d+)\/(\d+) (\d+)\:(\d+)/gm.exec(i);
							return new Date(t[3], parseInt(t[2]) - 1, t[1], t[4], t[5]);
						});

					return {
						from: t[0],
						to: t[1]
					}
				} else
					return null;
			});

		response.info = {
			email: response.dom.querySelector(`#LeftCol_MuaDichVu1_pnWrapperModule > table > tbody > tr:nth-child(1) > td:nth-child(2)`).innerText.trim(),
			occ: response.dom.querySelector(`#LeftCol_MuaDichVu1_pnWrapperModule > table > tbody > tr:nth-child(2) > td:nth-child(2)`).innerText.trim(),

			services: {
				basicAccess: dvList[0],
				unverifiedScore: dvList[1],
				payAsk: dvList[2],
				coupleCheckIn: dvList[3],
				shortAccess: dvList[4]
			}
		}

		this.__handleResponse("services", response);
		return response;
	},

	// For current schedule viewstate, we can use them if
	// global viewstate is being changed by another api
	// request
	__SCHEDULE_VIEWSTATE: undefined,
	__SCHEDULE_VIEWSTATEGENERATOR: undefined,
	__SCHEDULE_EVENTVALIDATION: undefined,
	__SCHEDULE_DATE: undefined,

	/**
	 * Lấy lịch học với ngày đầu tuần (hoặc ngày trong tuần) cho trước
	 * 
	 * @param	{Date} date	Thời gian trong tuần cần xem
	 */
	async schedule(date) {
		let response
		
		if (typeof date !== "undefined") {
			this.__SCHEDULE_DATE = `${date.getFullYear()}-${pleft(date.getMonth() + 1, 2)}-${date.getDate()}`;

			response = await this.request({
				path: "/Lichhoc.aspx",
				method: "POST",
				form: {
					__VIEWSTATE: this.__SCHEDULE_VIEWSTATE,
					__VIEWSTATEGENERATOR: this.__SCHEDULE_VIEWSTATEGENERATOR,
					__EVENTVALIDATION: this.__SCHEDULE_EVENTVALIDATION,
					ctl00$LeftCol$Lichhoc1$txtNgaydautuan: this.__SCHEDULE_DATE,
					ctl00$LeftCol$Lichhoc1$btnXemlich: "Xem lịch"
				}
			});
		} else {
			response = await this.request({
				path: "/Lichhoc.aspx",
				method: "GET"
			});

			this.__SCHEDULE_DATE = response.dom.getElementById("LeftCol_Lichhoc1_txtNgaydautuan").value;
		}

		// Update current schedule viewstate
		this.__SCHEDULE_VIEWSTATE = this.__VIEWSTATE;
		this.__SCHEDULE_VIEWSTATEGENERATOR = this.__VIEWSTATEGENERATOR;
		this.__SCHEDULE_EVENTVALIDATION = this.__EVENTVALIDATION;

		response.info = Array();
		for (let i = 0; i < 7; i++) {
			let table = response.dom.getElementById(`LeftCol_Lichhoc1_rptrLichhoc_grvLichhoc_${i}`);

			if (!table)
				continue;

			let time = table.parentElement.parentElement.children[0].innerText
				.replaceAll("\n", "")
				.replace(/\s\s+/g, " ")
				.trim();

			let item = { time, rows: [] }
			let rows = table.querySelectorAll(`tbody > tr:not(:first-child)`);
			
			for (let row of [ ...rows ]) {
				let classCol = row.children[5].innerHTML.trim().split("<br>");

				let noteID = null;
				let note = row.children[6].querySelector(":scope > span > a[href]");
				if (note && note.children[0] && note.children[0].title === "Đã có ghi chú") {
					let noteRe = /javascript:getNote\((\d+)\);/gm.exec(note.href);
					noteID = parseInt(noteRe[1]);
				}

				item.rows.push({
					time: row.children[1].innerText.trim(),
					classroom: row.children[2].innerText.trim(),
					subject: row.children[3].innerText.trim(),
					teacher: row.children[4].innerText.trim(),
					classID: classCol[0],
					listID: classCol[1],
					status: row.children[6].innerText.trim(),
					noteID
				});
			}

			response.info.push(item);
		}

		this.__handleResponse("schedule", response);
		return response;
	},

	/**
	 * Lấy ghi chú với id cho trước
	 * 
	 * @param	{Number} id	Note ID
	 */
	async getNote(id) {
		if (!this.__SCHEDULE_DATE || !this.__SCHEDULE_EVENTVALIDATION)
			throw { code: -1, description: `api.getNote(): a prefetch request to api.schedule() is required to use this api` }

		let response = await this.request({
			path: "/Lichhoc.aspx",
			method: "POST",
			form: {
				__VIEWSTATE: this.__SCHEDULE_VIEWSTATE,
				__VIEWSTATEGENERATOR: this.__SCHEDULE_VIEWSTATEGENERATOR,
				__EVENTVALIDATION: this.__SCHEDULE_EVENTVALIDATION,
				__CALLBACKID: "ctl00$LeftCol$Lichhoc1",
				__CALLBACKPARAM: `get-note$${id}`,
				ctl00$LeftCol$Lichhoc1$txtNgaydautuan: "2021-07-12"
			}
		});

		// Remove strage string at the begining
		let hashLength = parseInt(response.response.split("|")[0]);
		let cleanRes = response.response
			.replace(`${hashLength}|`, "")
			.substring(hashLength);

		response.data = { content: cleanRes }
		this.__handleResponse("getNote", response);
		return response;	
	},

	// For current tests viewstate, we can use them if
	// global viewstate is being changed by another api
	// request
	__TESTS_VIEWSTATE: undefined,
	__TESTS_VIEWSTATEGENERATOR: undefined,
	__TESTS_EVENTVALIDATION: undefined,

	/**
	 * API Lấy lịch thi
	 * 
	 * @param	{String}	type
	 * Loại danh sách cần lấy. Chấp nhận:
	 * + `all`:		Tất cả
	 * + `ended`:	Đã thi/Đã kết thúc
	 * + `coming`:	Sắp thi
	 */
	async tests(type) {
		let option = {
			all: "rbtnTatca",
			ended: "rbtnDathi",
			coming: "rbtnChuathi"
		}[type]

		// If viewstate for tests page haven't been set, that's mean
		// we will have to make a prefetch request first in order
		// to update current viewstate
		if (!this.__TESTS_VIEWSTATE) {
			clog("DEBG", "api.tests(): Starting prefetch request");
			await this.request({ path: `/Lichthi.aspx` });

			this.__TESTS_VIEWSTATE = this.__VIEWSTATE;
			this.__TESTS_VIEWSTATEGENERATOR = this.__VIEWSTATEGENERATOR;
			this.__TESTS_EVENTVALIDATION = this.__EVENTVALIDATION;
		}

		let response = await this.request({
			path: `/Lichthi.aspx`,
			method: "POST",
			form: {
				__VIEWSTATE: this.__TESTS_VIEWSTATE,
				__VIEWSTATEGENERATOR: this.__TESTS_VIEWSTATEGENERATOR,
				__EVENTVALIDATION: this.__TESTS_EVENTVALIDATION,
				ctl00$LeftCol$Lichthi1$Tuychon: option,
				ctl00$LeftCol$Lichthi1$btnHien: "   Hiện   "
			}
		});

		let list = []
		let curTime = time();
		let rows = response.dom.querySelectorAll(`#leftcontent > table > tbody > tr:not(:first-child)`);
		for (let row of rows) {
			let time = row.children[1].innerText.trim();
			time = /(\d+)\:(\d+) (\d+)\/(\d+)\/(\d+)/gm.exec(time);

			/** @type {Date} */
			time = new Date(time[5], parseInt(time[4]) - 1, time[3], time[1], time[2]);

			list.push({
				status: ((time.getTime() / 1000) < curTime)
					? "ended"
					: "coming",

				time,
				classroom: row.children[2].innerText.trim(),
				subject: row.children[3].innerText.trim(),
				listID: row.children[4].innerText.trim()
			});
		}

		// Sort list by start time
		list = list.sort((a, b) => b.time - a.time);
		response.list = list;

		this.__handleResponse("tests", response);
		return response;
	},

	// For current subscribe viewstate, we can use them if
	// global viewstate is being changed by another api
	// request
	__SUBS_VIEWSTATE: undefined,
	__SUBS_VIEWSTATEGENERATOR: undefined,
	__SUBS_EVENTVALIDATION: undefined,
	__SUBS_STUDENTID: undefined,

	/**
	 * Parse Subscribe Entries
	 * @param {HTMLTableElement} node
	 */
	parseSubscribe(node) {
		let rows = node.querySelectorAll(":scope > tbody > tr:not(:first-child)");
		let items = []

		for (let row of rows) {
			let item = {
				expired: false,
				isFull: false,
				classID: undefined,
				subject: undefined,
				teacher: undefined,
				credits: undefined,
				tuition: undefined,
				minimum: undefined,
				maximum: undefined,
				subscribed: undefined,
				schedule: [],
				classroom: [],
				action: {
					command: undefined,
					classID: undefined,
				},
				date: {
					start: undefined,
					end: undefined,
					cancel: undefined
				}
			}

			// Parse first cell
			let firstCell = row.children[0];
			
			if (firstCell.innerText.includes("Hết hạn ĐK"))
				item.expired = true;

			if (firstCell.innerText.includes("Hết chỉ tiêu"))
				item.isFull = true;

			let actionBtn = firstCell.querySelector(":scope > a[href]");
			if (actionBtn) {
				// Test subscribe button
				let sub = /javascript:subcrible\((\d+)\, (\d+), (\d+)\)/gm.exec(actionBtn.href);
				if (sub) {
					item.action.command = "subscribe";
					item.action.classID = parseInt(sub[1]);
				}

				// Test unsubscribe button
				let unsub = /javascript:unSubcrible\((\d+)\,(\d+)\)/gm.exec(actionBtn.href);
				if (unsub) {
					item.action.command = "unsubscribe";
					item.action.classID = parseInt(sub[1]);
				}
			}

			item.classID = row.children[1].innerText.trim();
			
			// Parse basic data
			let secondCell = /^(.+) \((\d+) tc\)[\n\s]+(.+)(?:[\n\s]+Học phí: (\d+)\*1000 \(đ\)|$)/gm
				.exec(row.children[2].innerText.trim());
			
			if (secondCell) {
				item.subject = secondCell[1];
				item.credits = parseInt(secondCell[2]);
				item.teacher = secondCell[3];
				
				if (secondCell[4])
					item.tuition = parseInt(secondCell[4]) * 1000;
			}

			item.minimum = parseInt(row.children[3].innerText.trim().replace(" sv", ""));
			item.maximum = parseInt(row.children[4].innerText.trim().replace(" sv", ""));
			item.subscribed = parseInt(row.children[5].innerText.trim().replace(" sv", ""));

			// Parse time window
			let timeCell = [ ...row.children[6].innerText.trim()
				.matchAll(/(\d+):(\d+) (\d+)\/(\d+)\/(\d+)/gm) ];

			for (let i = 0, cell = timeCell[i]; i < timeCell.length; i++) {
				let time = new Date("20" + cell[5], parseInt(cell[4]) - 1, cell[3], cell[1], cell[2]);

				if (i === 0)
					item.date.start = time;
				else if (i === 1)
					item.date.end = time;
				else if (i === 2)
					item.date.cancel = time;
			}

			let scheduleCell = row.children[7].querySelectorAll(`:scope > ul > li`);
			for (let line of scheduleCell) {
				let t = line.innerText
					.replaceAll("\n", "")
					.replace(/\s\s+/g, " ")
					.trim();

				let c = t.split(" - ")[1];
				if (!item.classroom.includes(c))
					item.classroom.push(c);

				item.schedule.push(t);
			}

			items.push(item);
		}

		return items;
	},

	/**
	 * API Đăng kí tín chỉ
	 * 
	 * @param	{String}	type
	 * Loại danh sách cần lấy. Chấp nhận:
	 * + `all`:		Tất cả
	 * + `ended`:	Đã thi/Đã kết thúc
	 * + `coming`:	Sắp thi
	 */
	async subscribe({
		action = "getmodule",
		classID
	} = {}) {
		// If viewstate for subscribe page haven't been set, that's mean
		// we will have to make a prefetch request first in order
		// to update current viewstate
		if (!this.__SUBS_VIEWSTATE) {
			clog("DEBG", "api.subscribe(): Starting prefetch request");
			let response = await this.request({
				path: `/DangkyLoptinchi.aspx`,
				ignoreAnnouncement: true
			});

			this.__SUBS_VIEWSTATE = this.__VIEWSTATE;
			this.__SUBS_VIEWSTATEGENERATOR = this.__VIEWSTATEGENERATOR;
			this.__SUBS_EVENTVALIDATION = this.__EVENTVALIDATION;

			// Get Student ID
			let studentID = /"getmodule:" \+ (\d+)\;/gm.exec(response.response);
			
			if (!studentID)
				throw { code: -1, description: `api.subscribe(): student id not found` }

			this.__SUBS_STUDENTID = parseInt(studentID[1]);
			clog("INFO", `api.subscribe(): Got student ID: ${this.__SUBS_STUDENTID}`);
		}

		let args;
		let callID;
		switch (action) {
			case "getmodule":
				callID = "__Page";
				args = `${action}:${this.__SUBS_STUDENTID}`;
				break;

			case "subscribe":
				callID = "ctl00$LeftCol$LoptinchiDangky1";
				args = `subcrible:${classID}:${this.__SUBS_STUDENTID}`;
				break;

			case "unsubscribe":
				callID = "ctl00$LeftCol$LoptinchiDangky1";
				args = `unsubcrible:${classID}:${this.__SUBS_STUDENTID}`;
				break;
		
			default:
				throw { code: -1, description: `api.subscribe(): undefined command: ${command}` }
		}

		clog("DEBG", "api.subscribe(): args", args || "empty");
		let response = await this.request({
			path: "/DangkyLoptinchi.aspx",
			method: "POST",
			form: {
				__CALLBACKID: callID,
				__CALLBACKPARAM: args,
				__VIEWSTATE: this.__SUBS_VIEWSTATE,
				__VIEWSTATEGENERATOR: this.__SUBS_VIEWSTATEGENERATOR,
				__EVENTVALIDATION: this.__SUBS_EVENTVALIDATION,
			}
		});

		let errorRe = /^(\d+)\|(.*)$/g.exec(response.response.trim());

		if (errorRe && errorRe[2] === "")
			throw { code: -1, description: `api.subscribe(${args}): got empty response, maybe subscribing has failed` }

		if (errorRe && errorRe[2].includes("Lỗi:"))
			throw { code: -1, description: `api.subscribe(${args}): ${errorRe[2]}` }

		let tables = response.dom.querySelectorAll("table[border]");

		if (tables && tables[0])
			response.waiting = this.parseSubscribe(tables[0]);

		if (tables && tables[1])
			response.subscribed = this.parseSubscribe(tables[1]);

		this.__handleResponse("subscribe", response);
		return response;
	},

	reset() {
		this.__VIEWSTATE = undefined;
		this.__VIEWSTATEGENERATOR = undefined;
		this.__EVENTVALIDATION = undefined;

		this.__LOGOUT_VIEWSTATE = undefined;
		this.__LOGOUT_VIEWSTATEGENERATOR = undefined;

		this.__SCHEDULE_VIEWSTATE = undefined;
		this.__SCHEDULE_VIEWSTATEGENERATOR = undefined;
		this.__SCHEDULE_EVENTVALIDATION = undefined;

		this.__TESTS_VIEWSTATE = undefined;
		this.__TESTS_VIEWSTATEGENERATOR = undefined;
		this.__TESTS_EVENTVALIDATION = undefined;

		this.__SUBS_VIEWSTATE = undefined;
		this.__SUBS_VIEWSTATEGENERATOR = undefined;
		this.__SUBS_EVENTVALIDATION = undefined;
		this.__SUBS_STUDENTID = undefined;
	}
}