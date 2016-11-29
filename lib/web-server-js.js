'use babel';

import WebServerJsView from './web-server-js-view';
import { CompositeDisposable } from 'atom';

var http = require('http');
var url = require('url');
var fs = require('fs');
var util = require('util');
var os = require('os');
var child_process = require("child_process");
var GBK = require('../files/gbk.js').GBK;

//文件类型
var mimeType = {
    'txt': 'text/plain',
    'html': 'text/html',
    'css': 'text/css',
    'xml': 'application/xml',
    'json': 'application/json',
    'js': 'application/javascript',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'png': 'image/png',
    'svg': 'image/svg+xml',
    "swf": "application/x-shockwave-flash",
    "tiff": "image/tiff",
    "wav": "audio/x-wav",
    "wma": "audio/x-ms-wma",
    "wmv": "video/x-ms-wmv"
};

//404未找到页面
var page_404 = function (req, res, path) {
    res.writeHead(404, {
        'Content-Type': 'text/html'
    });
    res.write('<!doctype html>\n');
    res.write('<title>404 Not Found</title>\n');
    res.write('<h1>Not Found</h1>');
    res.write(
        '<p>The requested URL ' +
        path +
        ' was not found on this server.</p>'
    );
    res.end();
};

//500错误页面
var page_500 = function (req, res, error) {
    res.writeHead(500, {
        'Content-Type': 'text/html'
    });
    res.write('<!doctype html>\n');
    res.write('<title>Internal Server Error</title>\n');
    res.write('<h1>Internal Server Error</h1>');
    res.write('<pre>' + util.inspect(error) + '</pre>');
};

//获取本地ip
function getLocalIP() {
    var ifaces = os.networkInterfaces();
    var ip = '';
    for (var dev in ifaces) {
        if (ifaces.hasOwnProperty(dev)) {
            ifaces[dev].forEach(function (details) {
                if (details.family == 'IPv4' && details.address.indexOf(192) >= 0) {
                    ip = details.address;
                }
            });
        }
    }
    if (ip == '') {
        ip = '127.0.0.1';
    }
    return ip;
}

export default {

  webServerJsView: null,
  modalPanel: null,
  subscriptions: null,

  //文库列表
  list: [],
  //web服务器
  server: null,
  //地址映射列表
  mappingList: {},
  //创建web服务器

  activate(state) {
    this.webServerJsView = new WebServerJsView(state.webServerJsViewState);
    this.modalPanel = atom.workspace.addModalPanel({
      item: this.webServerJsView.getElement(),
      visible: false
    });

    // Events subscribed to in atom's system can be easily cleaned up with a CompositeDisposable
    this.subscriptions = new CompositeDisposable();

    // Register command that toggles this view
    this.subscriptions.add(atom.commands.add('atom-workspace', {
      'web-server-js:WebServer': () => this.run()
    }));
  },

  deactivate() {
    this.modalPanel.destroy();
    this.subscriptions.dispose();
    this.webServerJsView.destroy();
  },

  serialize() {
    return {
      webServerJsViewState: this.webServerJsView.serialize()
    };
  },

  toggle() {
    console.log('WebServerJs was toggled!');
    return (
      this.modalPanel.isVisible() ?
      this.modalPanel.hide() :
      this.modalPanel.show()
    );
  },

  createServer() {
        var that = this;
		console.info("glenn 1");
        this.server = http.createServer(function (req, res) {
            var pathname = url.parse(req.url).pathname;
            var mappingId = '';
            var filePath = pathname.replace(/^\/wiki(\d{3,}?)\//g, function (match, $1) {
                mappingId = 'wiki' + $1;
                return ''
            });
/*            if (!that.mappingList[mappingId]) {
                return page_404(req, res, pathname);
            }*/
            //编码切换
            try {
                filePath = decodeURI(filePath);
            } catch (e) {
                filePath = GBK.decode(filePath);
            }
            //真实地址
			var atomProjects = atom.project.getPaths();
			var editor = atom.workspace.getActiveTextEditor();
			var editorPath = editor.getPath();

			for (i = 0; i < atomProjects.length; i++) {
				if (editorPath.indexOf(atomProjects[i]) != -1) {
					projectPath = atomProjects[i];
					break;
				}
			}
			
			//console.info("glenn projectPath:" + projectPath);
			//console.info("glenn atomProjects:" + atomProjects + "\editorPath:"+ editorPath);

            //var realPath = "E:\\1-培训-学习-进阶-文档\\Glenn-Li.github.io\\wiki" + filePath;
			var realPath = projectPath + filePath;
            //解析文件
			//console.info("glenn realPath:" + realPath + "\tpathname:"+ pathname + "\t filePath:" + filePath);
            fs.exists(realPath, function (exists) {
                if (!exists) {
                    return page_404(req, res, pathname);
                } else {
                    var file = fs.createReadStream(realPath);
                    res.writeHead(200, {
                        'Content-Type': mimeType[realPath.split('.').pop()] || 'text/plain'
                    });
                    file.on('data', res.write.bind(res));
                    file.on('close', res.end.bind(res));
                    file.on('error', function (err) {
                        return page_500(req, res, err);
                    });
                }
            });
        }).listen(5171);
        console.info('Server running at http://' + getLocalIP() + ':5171/');
    },

  //更新映射列表
    updateMap: function(list) {
        this.mappingList = {};
        for (var i = 0; i < list.length; i++) {
            var path = list[i].replace('library/', '');
            //缩短数字并设置为地址映射名
            this.mappingList['wiki' + this.createMappingId(path)] = path;
        }
    },

    //创建映射列表
    createMappingId: function (path) {
        path = path.replace(/\\/g, '/');
        //累加地址字符串每个字符Unicode值与其序号的乘积
        var code = 0;
        for (var j = 0; j < path.length; j++) {
            code += path.charCodeAt(j) * j;
        }
        //再与地址字符串长度拼合
        code = parseInt(path.length + '' + code);
        return code;
    },

    //浏览当前文档
    browser: function (list) {
        //编辑器

        var editor = atom.workspace.getActiveTextEditor();
        //状态验证，当编辑md文档时才允许操作
        var grammar, img;
        if (!editor) {
            return;
        }

        grammar = editor.getGrammar();
        if (!grammar) {
            return;
        }

        if (grammar.scopeName !== 'source.gfm' && grammar.scopeName !== 'text.md') {
            return;
        }

        if (editor.getPath().substr(-3) !== '.md') {
            alert('请先打开一篇文档！');
            return;
        }
        //更新地址映射
        for (var i = 0; i < list.length; i++) {
            var path = list[i].replace('library/', '');
            //缩短数字并设置为地址映射名
            this.mappingList['wiki' + this.createMappingId(path)] = path;
        }
        //判断服务器
        if (!this.server) {
            if (confirm('本地服务器还未启动，您需要启动服务器么？')) {
                this.createServer();
            }
        }

		console.info("Glenn 3");
        //解析地址
        var host = 'http://' + getLocalIP() + ':5171';
        var editorPath = editor.getPath();
        var mappingId = this.createMappingId(editorPath.split('library')[0]);
        var url;
        if (editorPath.indexOf('$navigation.md') >= 0) {
            url = host + '/wiki' + mappingId + '/index.html';
        } else {
            var filePath = editorPath.split('library\\')[1];
            if (typeof filePath == 'undefined') {
                url = host + '/wiki' + mappingId + '/index.html';
            } else {
                filePath = filePath.replace(/\\/g, '/').replace('.md', '');
                url = host + '/index.html?file=' + filePath;
            }
        }

		console.info("Glenn 31 url:" + url);
        //呼起默认浏览器打开页面
        var cmd;
        //windows
        if (process.platform == 'win32') {
            cmd = 'start';
        }
        //linux
        else if (process.platform == 'linux') {
            cmd = 'xdg-open';
        }
        //mac
        else if (process.platform == 'darwin') {
            cmd = 'open';
        }
        child_process.exec(cmd + ' ' + url);
    },
    //关闭服务器
    destroy: function () {
        this.server && this.server.close();
    },

	//启动服务器
    run: function () {
        //this.updateMap(this.list);

        if (this.server == null) {
            this.createServer();
        }

		this.browser(this.list);
    },
};
