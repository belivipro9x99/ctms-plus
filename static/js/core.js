//? |-----------------------------------------------------------------------------------------------|
//? |  /static/js/core.js                                                                           |
//? |                                                                                               |
//? |  Copyright (c) 2021 Belikhun. All right reserved                                              |
//? |  Licensed under the MIT License. See LICENSE in the project root for license information.     |
//? |-----------------------------------------------------------------------------------------------|

var APPNAME = "CTMS+";
var VERSION = "0.1";
var STATE = "local";

/**
 * This object contains CTMS+ core modules and will be
 * initialized after every resources on the page is loaded
 * 
 * @author	Belikhun
 * @version	1.0
 */
const core = {
	container: $("#container"),
	content: $("#content"),

	/**
	 * Initialize CTMS+ Core
	 * @param {Function}	set			Report Progress to Initializer
	 */
	async init(set = () => {}) {
		let start = time();

		// Disable connection state change
		__connection__.enabled = false;

		await this.initGroup(this, "core", ({ p, m, d }) => {
			clog("DEBG", {
				color: oscColor("pink"),
				text: truncateString(m, 34),
				padding: 34,
				separate: true
			}, d);

			set({ p, m, d });
		});
		
		set({ p: 100, m: "core", d: "CTMS+ Core Loaded" });
		this.initialized = true;

		clog("OKAY", {
			color: oscColor("pink"),
			text: "core",
			padding: 34,
			separate: true
		}, `CTMS+ Core Loaded In ${time() - start}s`);
	},

	/**
	 * Initialize A Group Object
	 * @param {Object}		group			The Target Object
	 * @param {String}		name			Group Name
	 * @param {Function}	set				Report Progress to Initializer
	 */
	async initGroup(group, name, set = () => {}) {
		let modulesList = []

		// Search for modules and initialize it
		set({ p: 0, m: name, d: `Scanning Modules Of ${name}` });

		for (let key of Object.keys(group)) {
			if (key === "super")
				continue;

			let item = group[key];
			if (item && !item.initialized && typeof item.init === "function") {
				// Set Up Module Constants
				item.__NAME__ = key;
				item.super = group;

				item.log = (level, ...args) => clog(level, {
					color: oscColor("pink"),
					text: truncateString(`${name}.${item.__NAME__}`, 34),
					padding: 34,
					separate: true
				}, ...args);

				// Push To Queues
				modulesList.push(item);
			}
		}

		if (modulesList.length === 0)
			return;

		// Sort modules by priority
		// The lower the value is, the higher the priority
		set({ p: 5, m: name, d: `Sorting Modules By Priority` });
		modulesList = modulesList.sort((a, b) => (a.priority || 0) - (b.priority || 0));
		
		if (modulesList.length > 0) {
			clog("DEBG", {
				color: oscColor("pink"),
				text: truncateString(name, 34),
				padding: 34,
				separate: true
			}, `Modules of`, {
				text: name,
				color: oscColor("pink")
			}, `(initialize from top to bottom)`);
	
			for (let [i, module] of modulesList.entries())
				clog("DEBG", {
					color: oscColor("pink"),
					text: truncateString(name, 34),
					padding: 34,
					separate: true
				}, " + ", pleft(i, 2), pleft(module.__NAME__, 38), pleft(module.priority || 0, 3));
		}

		// Initialize modules
		for (let i = 0; i < modulesList.length; i++) {
			let moduleStart = time();
			let item = modulesList[i];
			let path = `${name}.${item.__NAME__}`;
			let mP = 5 + (i / modulesList.length) * 95;

			set({ p: mP, m: path, d: `Initializing` });
			try {
				let returnValue = await item.init(({ p, m, d }) => set({
					p: mP + (p * (1 / modulesList.length) * 0.95),
					m: (m) ? `${path}.${m}` : path,
					d
				}), { clog: item.log });

				if (returnValue === false) {
					clog("INFO", {
						color: oscColor("pink"),
						text: truncateString(path, 34),
						padding: 34,
						separate: true
					}, `Module DISABLED! Skipping all Submodules`);

					item.initialized = false;
					continue;
				}

				item.initialized = true;

				// Try to find and initialize submodules
				await this.initGroup(item, path, ({ p, m, d }) => set({ m, d }));
			} catch(error) {
				if (error.code === 12)
					throw error;

				let e = parseException(error);
				throw { code: 12, description: `core.initGroup(${path}): ${e.description}`, data: error }
			}

			clog("OKAY", {
				color: oscColor("pink"),
				text: truncateString(path, 34),
				padding: 34,
				separate: true
			}, `Initialized in ${time() - moduleStart}s`);
		}

		delete modulesList;
	},

	popup: {
		priority: 0,
		init: () => popup.init()
	},

	metadata: {
		priority: 0,

		async init(set) {
			try {
				set({ p: 0, d: `Fetching Metadata` });
				let response = await myajax({
					url: "/metadata.json",
					method: "GET"
				});

				set({ p: 100, d: `Updating Metadata` });
				window.META = response;
				window.APPNAME = response.name;
				window.VERSION = response.version;
				window.STATE = response.branch;
				window.REPORT_ERROR = response.link.report;
				window.REPO_ADDRESS = response.link.repo;
			} catch(e) {
				this.log("WARN", "Could not fetch metadata file! Maybe it's missing?");
			}
		}
	},

	tooltip: {
		priority: 0,

		init(set) {
			set({ p: 0, d: `Initializing Tooltip` });
			tooltip.init();
		}
	},

	https: {
		priority: 0,

		init() {
			if (location.protocol !== "https:") {
				this.log("WARN", "Page is not served through https! Anyone can easily alter your data!");
				return false;
			}

			let upgradeInsecure = document.createElement("meta");
			upgradeInsecure.httpEquiv = "Content-Security-Policy";
			upgradeInsecure.content = "upgrade-insecure-requests";
			document.head.appendChild(upgradeInsecure);
		}
	},

	darkmode: {
		priority: 4,
		enabled: false,
		toggleHandlers: [],

		init() {
			this.update();
		},

		set(dark) {
			this.enabled = dark;

			if (this.initialized)
				this.update();
		},

		onToggle(f) {
			if (!f || typeof f !== "function")
				throw { code: -1, description: `core.Panel().button(${icon}).onClick(): not a valid function` }

			this.toggleHandlers.push(f);
			f(this.enabled);
		},

		update() {
			this.toggleHandlers.forEach(f => f(this.enabled));
			document.body.classList[this.enabled ? "add" : "remove"]("dark");
		}
	},

	sounds: {
		priority: 3,

		__set: () => {},
		__clog: window.clog,
		/** @type	{Function[]} */
		handlers: [],

		async init(set, { clog } = {}) {
			if (typeof set === "function")
				this.__set = set;

			if (typeof clog === "function")
				this.__clog = clog;

			await sounds.init(({ p, m, d, c } = {}) => {
				this.__set({ p, m, d });
				this.handlers.forEach(f => f({ p, m, d, c }));
			}, { clog: this.__clog });
		},

		attach(f) {
			if (typeof f !== "function")
				throw { code: -1, description: `core.sounds.attach(): not a valid function` }

			return this.handlers.push(f);
		}
	},

	navbar: {
		priority: 1,
		container: $("#navbar"),

		title: navbar.title({
			icon: "/assets/img/icon.png",
			title: APPNAME
		}),

		/**
		 * Hamburger icon
		 * 
		 * User Settings Panel Toggler
		 * 
		 * @var navbar.menuButton
		 */
		menu: navbar.menuButton({
			tooltip: {
				title: "settings",
				description: `thay đổi cài đặt của ${APPNAME}`
			}
		}),

		/**
		 * Initialize Navigation Bar Module
		 * @param {Function}	set		Report Progress to Initializer
		 */
		init(set) {
			set({ p: 0, d: "Setting Up Navigation Bar" });
			navbar.init(this.container);

			set({ p: 20, d: "Adding Default Navigation Bar Modules" });
			this.menu.click.setHandler((active) => (active) ? smenu.show() : smenu.hide());
			smenu.onShow(() => this.menu.click.setActive(true));
			smenu.onHide(() => this.menu.click.setActive(false));

			navbar.insert(this.title, "left");
			navbar.insert(this.menu, "right");
		},

		switch: {
			component: navbar.switch(),
			schedule: null,
			tests: null,
			results: null,

			init() {
				navbar.insert(this.component, "left");
				core.darkmode.onToggle((dark) => this.component.set({ color: dark ? "dark" : "whitesmoke" }));
			}
		},
	},

	userSettings: {
		priority: 2,
		container: $("#userSettings"),

		/**
		 * Initialize User Settings Module
		 * @param {Function}	set		Report Progress to Initializer
		 */
		init(set) {
			set({ p: 0, d: "Setting Up User Settings Panel" });
			smenu.init(this.container, {
				title: "cài đặt",
				description: `thay đổi cách ${APPNAME} hoạt động`
			});

			smenu.onShow(() => core.content.classList.add("parallax"));
			smenu.onHide(() => core.content.classList.remove("parallax"));

			if (["beta", "indev", "debug", "test", "development"].includes(STATE)) {
				new smenu.components.Note({
					level: "warning",
					message: `
						Đây là bản thử nghiệm không ổn định dùng để kiểm tra tính ổn định trước khi xuất bản!<br>
						Nếu bạn tìm thấy lỗi, hãy báo cáo lỗi tại link ở phần <b>LIÊN KẾT NGOÀI</b> bên dưới!
					`
				},
					new smenu.Child({ label: "Cảnh Báo" },
						new smenu.Group({
							icon: "exclamation",
							label: "thử nghiệm"
						})
					)
				)
			}
		},

		ctms: {
			/** @type {smenu.Group} */
			group: undefined,
			
			init() {
				this.group = new smenu.Group({
					icon: "circle",
					label: "CTMS"
				});
			},

			status: {
				/** @type {smenu.Child} */
				child: undefined,

				view: undefined,
				
				requests: 0,
				online: 0,
				c2m: { total: 0, count: 0 },
				m2s: { total: 0, count: 0 },
				server: { success: 0, failed: 0 },
				middleware: { success: 0, failed: 0 },

				init() {
					this.child = new smenu.Child({
						label: "Tình Trạng"
					}, this.super.group);

					this.view = makeTree("div", ["component", "ctmsStatus"], {
						basic: { tag: "div", class: "row", child: {
							online: { tag: "span", class: ["item", "infoCard"], child: {
								label: { tag: "t", class: "label", text: "Số Truy Cập" },
								value: { tag: "t", class: "value", text: "---" }
							}},

							request: { tag: "span", class: ["item", "infoCard"], child: {
								label: { tag: "t", class: "label", text: "Số Yêu Cầu" },
								value: { tag: "t", class: "value", text: "0" }
							}}
						}},

						network: { tag: "div", class: ["item", "infoCard", "network"], child: {
							label: { tag: "t", class: "label", text: "Mạng" },
							nodes: { tag: "div", class: "nodes", child: {
								server: { tag: "span", class: "node", child: {
									label: { tag: "t", class: "label", text: "CTMS" },
									icon: { tag: "icon", data: { icon: "server" } },
									status: { tag: "div", class: "status", child: {
										success: { tag: "t", class: "success", text: "0" },
										failed: { tag: "t", class: "failed", text: "0" }
									}}
								}},

								m2s: { tag: "t", class: ["value", "m2s"], text: "--- ms" },

								middleware: { tag: "span", class: "node", child: {
									label: { tag: "t", class: "label", text: "Middleware" },
									icon: { tag: "icon", data: { icon: "hive" } },
									status: { tag: "div", class: "status", child: {
										success: { tag: "t", class: "success", text: "0" },
										failed: { tag: "t", class: "failed", text: "0" }
									}}
								}},

								c2m: { tag: "t", class: ["value", "c2m"], text: "--- ms" },

								client: { tag: "span", class: "node", child: {
									label: { tag: "t", class: "label", text: "Client" },
									icon: { tag: "icon", data: { icon: "laptop" } }
								}}
							}}
						}}
					});

					this.child.insert(this.view);

					api.onResponse("global", (data) => {
						this.requests++;
						this.server.success++;
						this.middleware.success++;

						this.m2s.count++;
						this.m2s.total += data.time;

						this.c2m.count++;
						this.c2m.total += data.c2m;

						let onlineNode = data.dom.getElementById("menubottom");
						if (onlineNode)
							this.online = parseInt(onlineNode.innerText.match(/\d+/)[0]);

						this.update();
					});

					api.onResponse("error", (error) => {
						this.requests++;
						this.c2m.count++;
						this.c2m.total += error.c2m;
						
						if (!error.data || error.data.code > 0 && error.data.code < 100) {
							this.middleware.failed++;
						} else {
							this.middleware.success++;

							if (error.data.status >= 400)
								this.server.failed++;
							else
								this.server.success++;
						}

						this.update();
					});
				},

				update() {
					this.view.basic.online.value.innerText = this.online;
					this.view.basic.request.value.innerText = this.requests;
					this.view.network.nodes.server.status.success.innerText = this.server.success;
					this.view.network.nodes.server.status.failed.innerText = this.server.failed;
					this.view.network.nodes.middleware.status.success.innerText = this.middleware.success;
					this.view.network.nodes.middleware.status.failed.innerText = this.middleware.failed;
					this.view.network.nodes.m2s.innerText = `${this.m2s.count > 0 ? round((this.m2s.total / this.m2s.count) * 1000, 2) : "X"} ms`;
					this.view.network.nodes.c2m.innerText = `${this.c2m.count > 0 ? round((this.c2m.total / this.c2m.count) * 1000, 2) : "X"} ms`;

					if (this.middleware.success === 0 && this.middleware.failed > 0)
						this.view.network.nodes.middleware.classList.add("failed");
					else
						this.view.network.nodes.middleware.classList.remove("failed");

					if (this.server.success === 0 && this.server.failed > 0)
						this.view.network.nodes.server.classList.add("failed");
					else
						this.view.network.nodes.server.classList.remove("failed");
				}
			},

			services: {
				/** @type {smenu.Child} */
				child: undefined,

				/** @type {HTMLDivElement} */
				view: undefined,
				
				/** @type {smenu.Panel} */
				panel: undefined,

				serviceInfo: undefined,

				name: {
					basicAccess: "Truy Cập CTMS",
					unverifiedScore: "Xem Điểm Không Chờ Xác Nhận",
					payAsk: "Vấn Đáp Có Trả Phí PayAsk",
					coupleCheckIn: "Couple Check-In",
					shortAccess: "Truy Cập CTMS Ngắn Hạn"
				},

				Service: class {
					constructor({
						id = "sample",
						name = "Sample Service",
						time: timeData
					} = {}) {
						if (timeData && timeData.from && timeData.to) {
							this.container = makeTree("div", "infoCard", {
								label: { tag: "t", class: "label", text: name },
								time: { tag: "t", class: "text", html: `${timeData.from.toLocaleString()}<arr></arr>${timeData.to.toLocaleString()}` },
								value: { tag: "div", class: "value" }
							});

							liveTime(this.container.value, time(timeData.to), {
								type: "minimal",
								count: "down",
								ended: "VỪA HẾT HẠN!"
							});
						} else {
							this.container = makeTree("div", "infoCard", {
								label: { tag: "t", class: "label", text: name },
								buttons: { tag: "div", class: "buttons", child: {
									serviceInfo: createButton("Thông Tin", { color: "blue", icon: "infoCircle", complex: true, disabled: true }),
									buyService: createButton("MUA DỊCH VỤ", { color: "pink", icon: "externalLink", complex: true })
								}}
							});
						}
					}
				},

				init() {
					this.child = new smenu.Child({
						label: "Dịch Vụ"
					}, this.super.group);

					this.panel = new smenu.Panel(undefined, { size: "large" });

					this.view = makeTree("div", ["component", "ctmsServices"], {
						occCard: { tag: "div", class: "infoCard", child: {
							label: { tag: "t", class: "label", text: "OCC" },
							value: { tag: "t", class: "value", text: "X occ" }
						}},

						list: { tag: "div", class: "list" }
					});

					this.child.insert(this.view);

					core.account.onLogout(() => {
						this.view.occCard.value.innerText = "X occ";
						emptyNode(this.view.list);
					});

					api.onResponse("services", (data) => {
						this.view.occCard.value.innerText = data.info.occ;
						emptyNode(this.view.list);

						for (let key of Object.keys(data.info.services)) {
							let s = new this.Service({
								id: key,
								name: this.name[key] || key,
								time: data.info.services[key]
							});

							this.view.list.appendChild(s.container);
						}
					});
				},

				buy(id) {
					// TODO: Buying Services Implementation
				}
			},

			server: {
				group: smenu.Group.prototype,

				init() {
					this.group = new smenu.Group({ label: "máy chủ", icon: "server" });
					let general = new smenu.Child({ label: "Chung" }, this.group);

					let mwOptions = {}
					let mwDefault = undefined;

					for (let key of Object.keys(META.middleware)) {
						mwOptions[key] = META.middleware[key].name;

						if (META.middleware[key].default)
							mwDefault = key;
					}

					let mwSelect = new smenu.components.Select({
						label: "Middleware",
						icon: "hive",
						options: mwOptions,
						defaultValue: mwDefault,
						save: "server.middleware",
						onChange: (v) => api.MIDDLEWARE = META.middleware[v].host
					}, general);
				}
			},

			display: {
				group: smenu.Group.prototype,
	
				init() {
					this.group = new smenu.Group({ label: "hiển thị", icon: "window" });
	
					let ux = new smenu.Child({ label: "Giao Diện" }, this.group);
					
					new smenu.components.Checkbox({
						label: "Chế độ ban đêm",
						color: "pink",
						save: "display.nightmode",
						defaultValue: false,
						onChange: (v) => core.darkmode.set(v)
					}, ux);
	
					new smenu.components.Checkbox({
						label: "Hoạt ảnh",
						color: "blue",
						save: "display.transition",
						defaultValue: true,
						onChange: (v) => document.body.classList[v ? "remove" : "add"]("disableTransition")
					}, ux);
	
					let other = new smenu.Child({ label: "Khác" }, this.group);
	
					new smenu.components.Checkbox({
						label: "Thông báo",
						color: "pink",
						save: "display.notification",
						defaultValue: false,
						disabled: true
					}, other);
				}
			},

			sounds: {
				group: smenu.Group.prototype,
	
				init() {
					this.group = new smenu.Group({ label: "âm thanh", icon: "volume" });
		
					let status = new smenu.Child({ label: "Trạng Thái" }, this.group);
					let loadDetail = new smenu.components.Text({ content: "Chưa khởi tạo âm thanh" });
					status.insert(loadDetail, -3);
	
					core.sounds.attach(({ c } = {}) => {
						if (typeof c === "string")
							loadDetail.content = c
					});
	
					let volume = new smenu.components.Slider({
						label: "Âm lượng",
						color: "blue",
						save: "sounds.volume",
						min: 0,
						max: 100,
						unit: "%",
						defaultValue: 60
					});
	
					status.insert(volume, -1);
					volume.onInput((v) => {
						sounds.volume = (v / 100);
						volume.set({ color: (v >= 80) ? "red" : "blue" })
					});
		
					let cat = new smenu.Child({ label: "Loại" }, this.group);
					let mouseOver = new smenu.components.Checkbox({
						label: "Mouse Over",
						color: "blue",
						save: "sounds.mouseOver",
						defaultValue: true,
						onChange: (v) => sounds.enable.mouseOver = v
					}, cat);
		
					let btnClick = new smenu.components.Checkbox({
						label: "Button Click/Toggle",
						color: "blue",
						save: "sounds.btnClick",
						defaultValue: true,
						onChange: (v) => sounds.enable.btnClick = v
					}, cat);
		
					let panelToggle = new smenu.components.Checkbox({
						label: "Panel Show/Hide",
						color: "blue",
						save: "sounds.panelToggle",
						defaultValue: true,
						onChange: (v) => sounds.enable.panelToggle = v
					}, cat);
		
					let others = new smenu.components.Checkbox({
						label: "Others",
						color: "blue",
						save: "sounds.others",
						defaultValue: true,
						onChange: (v) => sounds.enable.others = v
					}, cat);
		
					let notification = new smenu.components.Checkbox({
						label: "Notification",
						color: "blue",
						save: "sounds.notification",
						defaultValue: true,
						onChange: (v) => sounds.enable.notification = v
					}, cat);
		
					let master = new smenu.components.Checkbox({
						label: "Bật âm thanh",
						color: "pink",
						save: "sounds.master",
						defaultValue: false,
						onChange: async (v) => {
							sounds.enable.master = v;
							mouseOver.set({ disabled: !v });
							btnClick.set({ disabled: !v });
							panelToggle.set({ disabled: !v });
							others.set({ disabled: !v });
							notification.set({ disabled: !v });
	
							if (v)
								sounds.soundToggle(sounds.sounds.checkOn);
		
							if (core.initialized && !sounds.initialized)
								await core.sounds.init();
						}
					});
	
					status.insert(master, -2);
				}
			},

			projectInfo: {
				group: smenu.Group.prototype,
				licensePanel: smenu.Panel.prototype,
	
				async init() {
					this.group = new smenu.Group({ label: "thông tin", icon: "info" });
					let links = new smenu.Child({ label: "Liên Kết Ngoài" }, this.group);
	
					// Project Info View
					let projectInfo = makeTree("div", "projectInfo", {
						header: { tag: "div", class: "header", child: {
							icon: new lazyload({ source: "/assets/img/icon.png", classes: "icon" })
						}},

						pTitle: { tag: "t", class: "title", text: APPNAME },
						description: { tag: "t", class: "description", text: "The Next Generation Of CTMS" },

						note: createNote({
							level: "info",
							message: "CTMS+ không được hỗ trợ bởi OTSC hoặc các bên liên quan"
						}),

						authorLabel: { tag: "t", class: "label", text: "Tác Giả" },
						author: { tag: "span", class: "author" },

						contributorLabel: { tag: "t", class: "label", child: {
							content: { tag: "span", text: "Người Đóng Góp" },
							tip: { tag: "tip", title: "Tên của bạn sẽ xuất hiện trong danh sách này nếu bạn có đóng góp cho dự án (bằng cách tạo commit hoặc pull request)" }
						}},

						contributors: { tag: "span", class: "contributor" },
					});

					for (let username of Object.keys(META.author))
						projectInfo.author.appendChild(makeTree("span", "item", {
							avatar: new lazyload({ source: `https://github.com/${username}.png?size=80`, classes: "avatar" }),
							aName: { tag: "a", target: "_blank", href: META.author[username].link, class: "name", text: META.author[username].name },
							department: { tag: "t", class: "department", text: META.author[username].department },
							role: { tag: "t", class: "role", text: META.author[username].role }
						}));
					
					for (let username of Object.keys(META.contributors))
						projectInfo.contributors.appendChild(makeTree("div", "item", {
							avatar: new lazyload({ source: `https://github.com/${username}.png?size=40`, classes: "avatar" }),
							username: { tag: "a", target: "_blank", href: `https://github.com/${username}`, class: "username", text: username },
							contributions: { tag: "t", class: "contributions", text: META.contributors[username].contributions }
						}));

					// Components
					new smenu.components.Button({
						label: "Báo Lỗi",
						color: "pink",
						icon: "externalLink",
						complex: true,
						onClick: () => window.open(REPORT_ERROR, "_blank")
					}, links);
					
					new smenu.components.Button({
						label: "Wiki",
						color: "pink",
						icon: "externalLink",
						complex: true,
						onClick: () => window.open(REPO_ADDRESS + "/wiki", "_blank")
					}, links);
					
					new smenu.components.Button({
						label: "Mã Nguồn",
						color: "pink",
						icon: "externalLink",
						complex: true,
						onClick: () => window.open(REPO_ADDRESS, "_blank")
					}, links);
	
					let project = new smenu.Child({ label: "Dự Án" }, this.group);
	
					let detailsButton = new smenu.components.Button({
						label: "Thông Tin",
						color: "blue",
						icon: "arrowLeft",
						complex: true
					}, project);
	
					(new smenu.Panel(projectInfo)).setToggler(detailsButton);
	
					let licenseButton = new smenu.components.Button({
						label: "LICENSE",
						color: "blue",
						icon: "arrowLeft",
						complex: true
					}, project);
	
					this.licensePanel = new smenu.Panel(undefined, { size: "large" });
					this.licensePanel.setToggler(licenseButton);
					await this.licensePanel.content("iframe:/license.html");
					core.darkmode.onToggle((enabled) => this.licensePanel.iframe.contentDocument.body.classList[enabled ? "add" : "remove"]("dark"));
	
					new smenu.components.Footer({
						icon: "/assets/img/icon.png",
						appName: APPNAME,
						version: `${VERSION} - ${STATE}`
					}, project);
				}
			}
		}
	},

	account: {
		priority: 4,

		loggedIn: false,
		background: null,

		/** @type {HTMLElement} */
		nameNode: null,

		/** @type {lazyload} */
		avatarNode: null,

		navtip: navbar.Tooltip.prototype,
		clickable: navbar.Clickable.prototype,
		subWindow: navbar.SubWindow.prototype,

		loginView: null,
		detailView: null,

		loginHandlers: [],
		logoutHandlers: [],

		async init(set) {
			set({ p: 0, d: `Setting Up Account Panel` });
			let container = document.createElement("span");
			container.classList.add("component", "account");

			this.background = triBg(container, { color: "darkBlue", scale: 1, triangleCount: 8, speed: 6 });

			this.avatarNode = new lazyload({
				source: "/assets/img/guest.png",
				classes: ["avatar", "light"]
			});

			this.nameNode = document.createElement("t");
			this.nameNode.classList.add("name");
			this.nameNode.innerText = "Khách";

			container.append(this.avatarNode.container, this.nameNode);

			this.navtip = new navbar.Tooltip(container, {
				title: "account",
				description: "nhấn để đăng nhập!"
			});

			this.clickable = new navbar.Clickable(container);
			
			this.subWindow = new navbar.SubWindow(container);
			this.clickable.setHandler(() => this.subWindow.toggle());
			this.subWindow.color = "blue";

			this.loginView = makeTree("form", "loginView", {
				label: { tag: "div", class: "label", child: {
					content: { tag: "t", class: "content", text: "Đăng Nhập CTMS" },
					tip: { tag: "tip", title: `Chúng tôi không lưu lại dữ liệu của bạn khi gửi và nhận tới CTMS.\nMã nguồn của API và Middleware có thể tìm thấy ở trong repository của dự án!` }
				}},

				note: createNote({
					level: "warning",
					message: "This is a sample warning"
				}),

				username: createInput({
					type: "text",
					id: "account.login.username",
					label: "Tên Truy Cập",
					required: true
				}),

				password: createInput({
					type: "password",
					id: "account.login.password",
					label: "Mật Khẩu",
					required: true
				}),

				submitBtn: createButton("ĐĂNG NHẬP", {
					color: "blue",
					type: "submit",
					classes: "submit",
					style: "round",
					icon: "signin",
					complex: true
				}),

				forgotBtn: createButton("Quên Mật Khẩu", {
					color: "pink",
					classes: "forgot",
					style: "round",
					icon: "key",
					complex: true,
					disabled: true
				})
			});

			this.loginView.addEventListener("submit", () => {});
			this.loginView.action = "javascript:void(0);";
			this.loginView.dataset.active = "main";
			this.loginView.addEventListener("submit", () => this.login());
			this.loginView.note.group.style.display = "none";

			this.detailView = makeTree("div", "userDetailView", {
				label: { tag: "t", class: "label", text: "Đã Đăng Nhập" },

				userCard: { tag: "div", class: "userCard", child: {
					top: { tag: "div", class: "top", child: {
						avatar: new lazyload({
							source: "/assets/img/guest.png",
							classes: "avatar"
						}),

						info: { tag: "span", class: "info", child: {
							name: { tag: "t", class: "name", text: "Họ Tên" },
							studentID: { tag: "t", class: "id", text: "00A00000000" },
							email: { tag: "t", class: "email" }
						}}
					}},

					bottom: { tag: "span", class: "bottom", child: {
						birthday: { tag: "t", class: "birthday", title: "ngày sinh", text: "00/00/0000" },
						classroom: { tag: "t", class: "classroom", title: "lớp hành chính", text: "0000A00" }
					}}
				}},

				department: { tag: "div", class: ["infoCard", "department"], child: {
					label: { tag: "t", class: "label", text: "Ngành Học" },
					content: { tag: "t", class: ["value", "small"], text: "Không rõ" }
				}},

				tForm: { tag: "div", class: ["infoCard", "tForm"], child: {
					label: { tag: "t", class: "label", text: "Hình Thức Đào Tạo" },
					content: { tag: "t", class: ["value", "small"], text: "Không rõ" }
				}},

				signoutBtn: createButton("ĐĂNG XUẤT", {
					color: "blue",
					classes: "logout",
					style: "round",
					icon: "signout",
					complex: true
				})
			});

			let userCardBG = triBg(this.detailView.userCard, {
				color: "lightBlue",
				scale: 5,
				speed: 64
			});

			set({ p: 30, d: `Attaching Listeners` });
			core.darkmode.onToggle((dark) => userCardBG.setColor(dark ? "dark" : "lightBlue"));
			navbar.insert({ container }, "right");

			// Attach response handlers
			this.detailView.signoutBtn.addEventListener("click", () => this.logout());
			api.onResponse("global", (response) => this.check(response));
			api.onResponse("results", (response) => this.updateInfo(response));
			api.onResponse("services", (response) => {
				this.avatarNode.src = this.detailView.userCard.top.avatar.src = `https://www.gravatar.com/avatar/${md5(response.info.email)}?s=80`;
				this.detailView.userCard.top.info.email.innerText = response.info.email;
			});

			set({ p: 50, d: `Fetching Account Data` });
			await api.request();
		},

		onLogin(f) {
			if (typeof f !== "function")
				throw { code: -1, description: `core.account.onLogin(): not a valid function` }

			this.loginHandlers.push(f);
		},

		onLogout(f) {
			if (typeof f !== "function")
				throw { code: -1, description: `core.account.onLogout(): not a valid function` }

			this.logoutHandlers.push(f);
		},

		async check(response) {
			if (response.dom.getElementById("LeftCol_UserLogin1_pnlLogin")) {
				this.loggedIn = false;
				this.nameNode.innerText = "Khách";
				this.avatarNode.src = this.detailView.userCard.top.avatar.src = "/assets/img/guest.png";
				this.detailView.userCard.top.info.email.innerText = "";
				this.navtip.set({ description: `nhấn để đăng nhập!` });
				this.background.setColor("darkRed");

				if (!this.subWindow.content || !this.subWindow.content.isSameNode(this.loginView)) {
					this.log("OKAY", "User Signed Out");
					this.subWindow.content = this.loginView;
					this.logoutHandlers.forEach(f => f());
				}

				let errMsg = response.dom.getElementById("LeftCol_UserLogin1_lblMess");
				if (errMsg && errMsg.innerText !== "") {
					this.loginView.note.group.style.display = null;
					this.loginView.note.set({ message: errMsg.innerText });
				} else
					this.loginView.note.group.style.display = "none";

				this.subWindow.loading = false;
			} else if (this.loggedIn === false) {
				this.log("OKAY", "User Signed In");
				this.loggedIn = true;

				this.subWindow.loading = true;
				this.subWindow.content = this.detailView;
				this.background.setColor("navyBlue");
				
				await api.results();
				await api.services();
				this.loginHandlers.forEach(f => f());

				this.subWindow.loading = false;
			}
		},

		updateInfo(response) {
			this.nameNode.innerText = response.info.name;
			this.detailView.userCard.top.info.name.innerText = response.info.name;
			this.detailView.userCard.top.info.studentID.innerText = response.info.studentID;
			this.detailView.userCard.bottom.birthday.innerText = response.info.birthday;
			this.detailView.userCard.bottom.classroom.innerText = response.info.classroom;
			this.detailView.department.content.innerText = response.info.department;
			this.detailView.tForm.content.innerText = response.info.tForm;
		},

		async login() {
			this.subWindow.loading = true;

			try {
				await api.login({
					username: this.loginView.username.input.value,
					password: this.loginView.password.input.value
				});
			} catch(e) {
				let error = parseException(e);
				this.loginView.note.group.style.display = null;
				this.loginView.note.set({
					level: "error",
					message: `<pre class="break">${error.code} >>> ${error.description}</pre>`
				});

				this.subWindow.loading = false;
			}
		},

		async logout() {
			this.detailView.signoutBtn.disabled = true;
			this.subWindow.loading = true;

			try {
				await api.logout();
				//localStorage.setItem("session", "");
				await api.request();
			} catch(error) {
				errorHandler(error);
			}

			this.detailView.signoutBtn.disabled = false;
			this.subWindow.loading = false;
		},
	},

	screen: {
		container: $("#content"),
		priority: 3,

		Screen: class {
			constructor({
				id = "sample",
				icon = "circle",
				title = "sample screen",
				description = "this is a sample screen description",
				subTitle = "",
				applyScrollable = true
			} = {}) {
				this.id = id;
				this.showing = false;
				this.reloadHandlers = []
				this.showHandlers = []
				this.hideHandlers = []

				this.button = core.navbar.switch.component.button({
					icon,
					tooltip: {
						title,
						description
					}
				});

				this.view = makeTree("div", ["screen", id], {
					loading: { tag: "div", class: "loading", child: {
						spinner: { tag: "span", class: "spinner" }
					}},

					overlay: { tag: "div", class: "overlay", child: {
						icon: { tag: "icon" },
						oTitle: { tag: "t", class: "title" },
						description: { tag: "t", class: "description" },
						buttons: { tag: "div", class: "buttons" }
					}},

					header: { tag: "div", class: "header", child: {
						icon: { tag: "icon", data: { icon } },
						detail: { tag: "span", class: "detail", child: {
							sTitle: { tag: "t", class: "title", text: title },
							subTitle: { tag: "t", class: "subTitle", html: subTitle }
						}},
					}},

					content: { tag: "div", class: "content" }
				});

				if (applyScrollable)
					new Scrollable(this.view, { content: this.view.content });

				this.view.overlay.style.display = "none";
				core.screen.container.appendChild(this.view);
				this.button.click.setHandler((a) => a ? this.show() : this.hide());
			}

			show() {
				this.showing = true;
				core.screen.container.dataset.screen = this.id;
				this.showHandlers.forEach(f => f());
			}

			onShow(f) {
				if (typeof f !== "function")
					throw { code: -1, description: `core.screen.Screen(${this.id}).onShow(): not a valid function` }
	
				this.showHandlers.push(f);
			}

			hide() {
				this.showing = false;
				this.hideHandlers.forEach(f => f());
			}

			onHide(f) {
				if (typeof f !== "function")
					throw { code: -1, description: `core.screen.Screen(${this.id}).onHide(): not a valid function` }
	
				this.hideHandlers.push(f);
			}

			set({
				icon,
				title,
				subTitle
			} = {}) {
				if (typeof icon === "string")
					this.view.header.icon.dataset.icon = icon;

				if (typeof title === "string")
					this.view.header.detail.sTitle.innerText = title;

				if (typeof subTitle === "string")
					this.view.header.detail.subTitle.innerHTML = subTitle;
			}

			overlay({
				show = true,
				icon = "circle",
				title = "Screen Overlay Example",
				description = " This is an example of screen overlay, which is immortal 😇",
				buttons = {}
			} = {}) {
				if (!show) {
					this.view.overlay.style.display = "none";
					return;
				}

				this.view.overlay.style.display = null;
				this.view.overlay.icon.dataset.icon = icon;
				this.view.overlay.oTitle.innerText = title;
				this.view.overlay.description.innerHTML = description;
				
				emptyNode(this.view.overlay.buttons);
				for (let key of Object.keys(buttons)) {
					let b = createButton(buttons[key].text, {
						color: buttons[key].color || "blue",
						style: "round",
						icon: buttons[key].icon,
						complex: true
					});

					if (typeof buttons[key].onClick === "function")
						b.addEventListener("click", () => buttons[key].onClick());

					this.view.overlay.buttons.appendChild(b);
				}
			}

			/** @param {Boolean} loading */
			set loading(loading) {
				this.view.loading.classList[loading ? "add" : "remove"]("show");
			}

			/** @param {String|HTMLElement} content */
			set content(content) {
				this.view.overlay.style.display = "none";
				emptyNode(this.view.content);

				if (typeof content === "object" && content.classList)
					this.view.content.appendChild(content);
				else
					this.view.content.innerHTML = content;
			}
		},

		init() {
			
		},

		schedule: {
			/** @type {core.screen.Screen} */
			screen: null,

			view: null,
			loaded: false,

			async init() {
				this.view = makeTree("div", "scheduleScreen", {
					control: { tag: "div", class: "control", child: {
						weekInput: createInput({
							type: "week",
							id: "schedule.week",
							label: "Tuần"
						}),

						confirm: createButton("XEM LỊCH", {
							icon: "calendarWeek",
							color: "brown",
							style: "round",
							complex: true,
							disabled: true
						})
					}},

					list: { tag: "div", class: ["list", "showEmpty"] }
				});

				this.screen = new core.screen.Screen({
					id: "schedule",
					icon: "calendarWeek",
					title: "lịch học",
					description: "xem lịch học trong tuần!",
					applyScrollable: false
				});

				this.screen.content = this.view;
				this.screen.loading = true;
				this.screen.onShow(() => this.load());
				new Scrollable(this.view, { content: this.view.list });

				this.view.control.confirm.addEventListener("click", () => this.load(this.getInputDate()));
				core.account.onLogin(async () => {
					if (this.screen.showing)
						this.load();
				});

				core.account.onLogout(() => this.onLogout());
				api.onResponse("schedule", (response) => {
					this.loaded = true;
					emptyNode(this.view.list);

					for (let item of response.info)
						this.addListItem(item);
				});

				this.setInputNow();
				this.screen.show();
			},

			reset() {
				this.loaded = false;
				emptyNode(this.view.list);
				this.setInputNow();
			},

			onLogout() {
				this.reset();
				this.view.control.confirm.disabled = true;
				this.screen.overlay({
					icon: "exclamation",
					title: "Yêu Cầu Đăng Nhập",
					description: `Bạn phải đăng nhập vào CTMS trước khi xem nội dung này!`,
					buttons: {
						login: { text: "ĐĂNG NHẬP", icon: "signin", onClick: () => core.account.clickable.active = true }
					}
				});

				this.screen.loading = false;
			},

			/**
			 * @param {Date} date 
			 * @returns
			 */
			async load(date) {
				if (!core.account.loggedIn) {
					this.onLogout();
					return;
				}

				if (!this.loaded) {
					this.screen.loading = true;
					this.screen.overlay({ show: false });
					await api.schedule();
					this.view.control.confirm.disabled = false;
					this.screen.loading = false;
				} else {
					if (date) {
						this.screen.loading = true;
						await api.schedule(date);
						this.screen.loading = false;
					}
				}
			},

			setInputNow(date = new Date()) {
				this.view.control.weekInput.input.value = `${date.getUTCFullYear()}-W${date.getWeek()}`;
			},

			getInputDate() {
				let v = this.view.control.weekInput.input.value.split("-W");
				let simple = new Date(parseInt(v[0]), 0, 1 + (parseInt(v[1]) - 1) * 7);
				let dow = simple.getDay();
				let ISOweekStart = simple;

				if (dow <= 4)
					ISOweekStart.setDate(simple.getDate() - simple.getDay() + 1);
				else
					ISOweekStart.setDate(simple.getDate() + 8 - simple.getDay());

				return ISOweekStart;
			},

			addListItem({ time, rows = [] } = {}) {
				let item = makeTree("div", "item", {
					label: { tag: "t", class: "label", text: time },
					table: { tag: "table", class: "generalTable", child: {
						thead: { tag: "thead", child: {
							row: { tag: "tr", child: {
								stt: { tag: "th", text: "Thứ Tự" },
								status: { tag: "th" },
								subject: { tag: "th", text: "Môn Học" },
								classroom: { tag: "th", text: "Lớp Học" },
								time: { tag: "th", text: "Giờ" },
								teacher: { tag: "th", text: "Giảng Viên" },
								classID: { tag: "th", text: "Mã Lớp" },
								listID: { tag: "th", text: "Mã DS Thi" },
							}}
						}},

						tbody: { tag: "tbody" }
					}}
				});

				let nth = 0;
				for (let row of rows)
					item.table.tbody.appendChild(makeTree("tr", "row", {
						stt: { tag: "td", text: ++nth },

						status: { tag: "td", class: "status", child: {
							inner: { tag: "span", data: { status: row.status }, text: row.status }
						}},

						subject: { tag: "td", text: row.subject },
						classroom: { tag: "td", text: row.classroom },
						time: { tag: "td", html: row.time.replace("->", "<arr></arr>") },
						teacher: { tag: "td", text: row.teacher },
						classID: { tag: "td", text: row.classID },
						listID: { tag: "td", text: row.listID }
					}));

				this.view.list.appendChild(item);
			}
		},

		tests: {
			init() {
				
			}
		},

		results: {
			init() {
				
			}
		},
	}
}