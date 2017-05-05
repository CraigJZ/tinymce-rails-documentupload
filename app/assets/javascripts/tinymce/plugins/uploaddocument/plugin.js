(function() {
  tinymce.PluginManager.requireLangPack('uploaddocument');

  tinymce.create('tinymce.plugins.UploadDocument', {
    UploadDocument: function(ed, url) {
      var form,
          iframe,
          win,
          throbber,
          editor = ed;

      function showDialog() {
        win = editor.windowManager.open({
          title: ed.translate('Insert a document from your computer'),
          width:  500 + parseInt(editor.getLang('uploaddocument.delta_width', 0), 10),
          height: 180 + parseInt(editor.getLang('uploaddocument.delta_height', 0), 10),
          body: [
            {type: 'iframe',  url: 'javascript:void(0)'},
            {type: 'textbox', name: 'file', label: ed.translate('Choose a document'), subtype: 'file'},
            {type: 'textbox', name: 'alt',  label: ed.translate('Document description')},
            {type: 'container', classes: 'error', html: "<p style='color: #b94a48;'>&nbsp;</p>"},

            // Trick TinyMCE to add a empty div that "preloads" the throbber image
            {type: 'container', classes: 'throbber'},
          ],
          buttons: [
            {
              text: ed.translate('Insert'),
              onclick: insertImage,
              subtype: 'primary'
            },
            {
              text: ed.translate('Cancel'),
              onclick: ed.windowManager.close
            }
          ],
        }, {
          plugin_url: url
        });

        // TinyMCE likes pointless submit handlers
        win.off('submit');
        win.on('submit', insertImage);

        /* WHY DO YOU HATE <form>, TINYMCE!? */
        iframe = win.find("iframe")[0];
        form = createElement('form', {
          action: ed.getParam("uploaddocument_form_url", "/tinymce_documents"),
          target: iframe._id,
          method: "POST",
          enctype: 'multipart/form-data',
          accept_charset: "UTF-8",
        });

        // Might have several instances on the same page,
        // so we TinyMCE create unique IDs and use those.
        iframe.getEl().name = iframe._id;

        // Create some needed hidden inputs
        form.appendChild(createElement('input', {type: "hidden", name: "utf8", value: "✓"}));
        form.appendChild(createElement('input', {type: 'hidden', name: 'authenticity_token', value: getMetaContents('csrf-token')}));
        form.appendChild(createElement('input', {type: 'hidden', name: 'hint', value: ed.getParam("uploaddocument_hint", "")}));

        var el = win.getEl();
        var body = document.getElementById(el.id + "-body");

        // Copy everything TinyMCE made into our form
        var containers = body.getElementsByClassName('mce-container');
        for(var i = 0; i < containers.length; i++) {
          form.appendChild(containers[i]);
        }

        // Fix inputs, since TinyMCE hates HTML and forms
        var inputs = form.getElementsByTagName('input');
        for(var i = 0; i < inputs.length; i++) {
          var ctrl = inputs[i];

          if(ctrl.tagName.toLowerCase() == 'input' && ctrl.type != "hidden") {
            if(ctrl.type == "file") {
              ctrl.name = "file";

              // Hack styles
              tinymce.DOM.setStyles(ctrl, {
                'border': 0,
                'boxShadow': 'none',
                'webkitBoxShadow': 'none',
              });
            } else {
              ctrl.name = "alt";
            }
          }
        }

        body.appendChild(form);
      }

      function insertImage() {
        if(getInputValue("file") == "") {
          return handleError('You must choose a file');
        }

        if(getInputValue("alt") == "") {
          return handleError('You must enter a description');
        }

        throbber = new top.tinymce.ui.Throbber(win.getEl());
        throbber.show();

        clearErrors();

        /* Add event listeners.
         * We remove the existing to avoid them being called twice in case
         * of errors and re-submitting afterwards.
         */
        var target = iframe.getEl();
        if(target.attachEvent) {
          target.detachEvent('onload', uploadDone);
          target.attachEvent('onload', uploadDone);
        } else {
          target.removeEventListener('load', uploadDone);
          target.addEventListener('load', uploadDone, false);
        }

        form.submit();
      }

      function uploadDone() {
        if(throbber) {
          throbber.hide();
        }

        var target = iframe.getEl();
        if(target.document || target.contentDocument) {
          var doc = target.contentDocument || target.contentWindow.document;
          handleResponse(doc.getElementsByTagName("body")[0].innerHTML);
        } else {
          handleError("Didn't get a response from the server");
        }
      }

      function handleResponse(ret) {
        try {
          var json = tinymce.util.JSON.parse(ret);

          if(json["error"]) {
            handleError(json["error"]["message"]);
          } else {
            var str = buildHTML(json);
            if (ed.execCommand('mceInsertContent', false, str)) {
              console.log(str);
            } else {
              console.log("Error");
            }

            ed.windowManager.close();
          }
        } catch(e) {
          console.log(e);
          handleError('Got a bad response from the server');
        }
      }

      function clearErrors() {
        var message = win.find(".error")[0].getEl();

        if(message)
          message.getElementsByTagName("p")[0].innerHTML = "&nbsp;";
      }

      function handleError(error) {
        var message = win.find(".error")[0].getEl();

        if(message)
          message.getElementsByTagName("p")[0].innerHTML = ed.translate(error);
      }

      function createElement(element, attributes) {
        var el = document.createElement(element);
        for(var property in attributes) {
          if (!(attributes[property] instanceof Function)) {
            el[property] = attributes[property];
          }
        }

        return el;
      }

      function buildHTML(json, default_text) {
        var default_class = ed.getParam("uploaddocument_default_img_class", "");
        var alt_text = getInputValue("alt");

        var docstr = "<a href='" + json["document"]["url"] + "' target='_blank' type='octet-stream'";

        if (default_class != "") {
          docstr += " class='" + default_class + "'";
				}

				docstr += '>'

				if (json["document"]["thumb"] && json["document"]["thumb"]["url"]) {
					thumb_json = json["document"]["thumb"];

					docstr += "<img src='" + thumb_json["url"] + "'";

        	if (thumb_json["height"]) {
          	docstr += " height='" + thumb_json["height"] + "'";
					}

					if (thumb_json["width"]) {
          	docstr += " width='" + thumb_json["width"] + "'";
					}

					docstr += " alt='" + alt_text + "' />";
				} else if (alt_text == "") {
          docstr += ed.translate('Click to download');
        } else {
					docstr +=  alt_text;
				}

				docstr += "</a>";

        return docstr;
      }

      function getInputValue(name) {
        var inputs = form.getElementsByTagName("input");

        for(var i in inputs)
          if(inputs[i].name == name)
            return inputs[i].value;

        return "";
      }

      function getMetaContents(mn) {
        var m = document.getElementsByTagName('meta');

        for(var i in m)
          if(m[i].name == mn)
            return m[i].content;

        return null;
      }

      // Add a button that opens a window
      editor.addButton('uploaddocument', {
        tooltip: ed.translate('Insert a document from your computer'),
        icon : 'newdocument',
        onclick: showDialog
      });

      // Adds a menu item to the tools menu
      editor.addMenuItem('uploaddocument', {
        text: ed.translate('Insert a document from your computer'),
        icon : 'newdocument',
        context: 'insert',
        onclick: showDialog
      });
    }
  });

  tinymce.PluginManager.add('uploaddocument', tinymce.plugins.UploadDocument);
})();
