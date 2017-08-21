/* globals chrome, compare_versions, get_version_warn */
var browsers;
var max_id = 0;

function context_menu_clicked(info) {
	let browser_id = parseInt(info.menuItemId.substring(8), 10);
	let url = info.modifiers.includes('Ctrl') ? null : info.pageUrl;
	open_browser(browser_id, url);
}

function context_menu_link_clicked(info) {
	let browser_id = parseInt(info.menuItemId.substring(13), 10);
	let url = info.modifiers.includes('Ctrl') ? null : info.linkUrl;
	open_browser(browser_id, url);
}

function open_browser(browser_id, url) {
	function split_args(argString) {
		let args = [];

		let temp = '';
		let inQuotes = false;
		for (let c of argString) {
			if (c == '"') {
				if (temp.endsWith('\\')) {
					temp = temp.substring(0, temp.length - 1) + c;
				} else {
					inQuotes = !inQuotes;
				}
			} else if (c == ' ' && !inQuotes) {
				args.push(temp);
				temp = '';
			} else {
				temp += c;
			}
		}

		if (temp.length > 0) {
			args.push(temp);
		}

		return args;
	}

	let browser = browsers.find(b => b.id == browser_id);
	let command = split_args(browser.command);
	let found = false;
	for (let i = 0; i < command.length; i++) {
		if (command[i].includes('%s')) {
			command[i] = command[i].replace('%s', url ? url : '');
			found = true;
		}
	}
	if (url && !found) {
		command.push(url);
	}
	console.log(command);

	function error_listener(error) {
		console.error(error, chrome.runtime.lastError);
	}
	let port = chrome.runtime.connectNative('open_with');
	port.onDisconnect.addListener(error_listener);
	port.onMessage.addListener(function(event) {
		console.log(event);
		port.onDisconnect.removeListener(error_listener);
		port.disconnect();
	});
	port.postMessage(command);
}

chrome.storage.local.get({'browsers': []}, result => {
	browsers = result.browsers;
	sort_browsers();
	make_menus();
});

function make_menus() {
	chrome.contextMenus.removeAll();

	for (let b of browsers) {
		max_id = Math.max(max_id, b.id);
		chrome.contextMenus.create({
			id: 'browser_' + b.id,
			title: b.name,
			contexts: ['page'/*, 'tab'*/],
			documentUrlPatterns: ['<all_urls>', 'file:///*'],
			onclick: context_menu_clicked
		});
		chrome.contextMenus.create({
			id: 'browser_link_' + b.id,
			title: b.name,
			contexts: ['link'],
			documentUrlPatterns: ['<all_urls>', 'file:///*'],
			onclick: context_menu_link_clicked
		});
	}
}

chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
	console.log(message);
	let {data} = message;
	switch (message.action) {
	case 'open_browser':
		open_browser(message.id, message.url);
		return;
	case 'get_browsers':
		sendResponse(browsers);
		return true;
	case 'add_browser':
		data.id = ++max_id;
		browsers.push(data);
		chrome.storage.local.set({browsers}, function() {
			make_menus();
			sendResponse(data.id);
		});
		return true;
	case 'remove_browser':
		let removed = false;
		for (let i = 0; i < browsers.length; i++) {
			let b = browsers[i];
			if (b.id == message.id) {
				browsers.splice(i, 1);
				removed = true;
				break;
			}
		}
		chrome.storage.local.set({browsers}, function() {
			make_menus();
			sendResponse(removed);
		});
		return true;
	case 'update_browser':
		// Update the existing object to keep any stray stuff.
		let browser = browsers.find(b => b.id == data.id);
		browser.name = data.name;
		browser.command = data.command;
		browser.icon = data.icon;
		chrome.storage.local.set({browsers}, function() {
			make_menus();
			sendResponse(true);
		});
		return true;
	case 'order_browsers':
		for (let b of browsers) {
			b.order = message.order.indexOf(b.id);
		}
		sort_browsers();
		chrome.storage.local.set({browsers}, function() {
			make_menus();
			sendResponse(true);
		});
		return true;
	}
});

function sort_browsers() {
	browsers.sort(function(a, b) {
		if (isNaN(a.order)) {
			return isNaN(b.order) ? 0 : 1;
		}
		return isNaN(b.order) ? -1 : a.order - b.order;
	});
}

get_version_warn().then(function(version_warn) {
	function error_listener() {
		chrome.browserAction.setBadgeText({text: '!'});
		chrome.browserAction.setBadgeBackgroundColor({color: [255, 51, 0, 255]});
	}

	let port = chrome.runtime.connectNative('open_with');
	port.onDisconnect.addListener(error_listener);
	port.onMessage.addListener(function(message) {
		if (message) {
			if (compare_versions(message.version, version_warn) < 0) {
				chrome.browserAction.setBadgeText({text: '!'});
				chrome.browserAction.setBadgeBackgroundColor({color: [255, 153, 0, 255]});
			}
		} else {
			error_listener();
		}
		port.onDisconnect.removeListener(error_listener);
		port.disconnect();
	});
	port.postMessage('ping');
});
