/**
 * Forum Article View
 *
 * @module moodle-mod_hsuforum-article
 */

/**
 * Handles updating forum article structure
 *
 * @constructor
 * @namespace M.mod_hsuforum
 * @class Article
 * @extends Y.Base
 */
function ARTICLE() {
    ARTICLE.superclass.constructor.apply(this, arguments);
}

ARTICLE.NAME = NAME;

ARTICLE.ATTRS = {
    /**
     * Current context ID, used for AJAX requests
     *
     * @attribute contextId
     * @type Number
     * @default undefined
     * @required
     */
    contextId: { value: undefined },

    /**
     * Used for REST calls
     *
     * @attribute io
     * @type M.mod_hsuforum.Io
     * @readOnly
     */
    io: { readOnly: true },

    /**
     * Used primarily for updating the DOM
     *
     * @attribute dom
     * @type M.mod_hsuforum.Dom
     * @readOnly
     */
    dom: { readOnly: true },

    /**
     * Used for routing URLs within the same page
     *
     * @attribute router
     * @type M.mod_hsuforum.Router
     * @readOnly
     */
    router: { readOnly: true },

    /**
     * Displays, hides and submits forms
     *
     * @attribute form
     * @type M.mod_hsuforum.Form
     * @readOnly
     */
    form: { readOnly: true },

    /**
     * Maintains an aria live log.
     *
     * @attribute liveLog
     * @type M.mod_hsuforum.init_livelog
     * @readOnly
     */
    liveLog: { readOnly: true },

    /**
     * Observers mutation events for editor.
     */
    editorMutateObserver: null
};

Y.extend(ARTICLE, Y.Base,
    {
        /**
         * Setup the app
         */
        initializer: function() {
            this._set('router', new M.mod_hsuforum.Router({article: this, html5: false}));
            this._set('io', new M.mod_hsuforum.Io({contextId: this.get('contextId')}));
            this._set('dom', new M.mod_hsuforum.Dom({io: this.get('io')}));
            this._set('form', new M.mod_hsuforum.Form({io: this.get('io')}));
            this._set('liveLog', M.mod_hsuforum.init_livelog());
            this.bind();
            // this.get('router').dispatch();
        },

        /**
         * Bind all event listeners
         * @method bind
         */
        bind: function() {
            var firstUnreadPost = document.getElementsByClassName("hsuforum-post-unread")[0];
            if(firstUnreadPost && location.hash === '#unread') {
                // get the post parent to focus on
                var post = document.getElementById(firstUnreadPost.id).parentNode;
                post.scrollIntoView();
                post.focus();
            }

            if (Y.one(SELECTORS.SEARCH_PAGE) !== null) {
                Y.log('Not binding event handlers on search page', 'info', 'Article');
                return;
            }
            var rootNode = Y.one(SELECTORS.CONTAINER);
            if (rootNode === null) {
                Y.log('Failed to bind event handlers', 'error', 'Article');
                return;
            }
            var dom     = this.get('dom'),
                form    = this.get('form'),
                router  = this.get('router'),
                addNode = Y.one(SELECTORS.ADD_DISCUSSION);

            /* Clean html on paste */
            Y.delegate('paste', form.handleFormPaste, document, '.hsuforum-textarea', form);

            // We bind to document otherwise screen readers read everything as clickable.
            Y.delegate('click', form.handleCancelForm, document, SELECTORS.LINK_CANCEL, form);
            Y.delegate('click', router.handleRoute, document, SELECTORS.CONTAINER_LINKS, router);
            Y.delegate('click', dom.handleViewRating, document, SELECTORS.RATE_POPUP, dom);

            // Advanced editor.
            Y.delegate('click', function(e){

                var editCont = Y.one('#hiddenadvancededitorcont'),
                    editor,
                    editArea,
                    advancedEditLink = this,
                    checkEditArea;

                if (!editCont){
                    return;
                }

                // Note, preventDefault is intentionally here as if an editor container is not present we want the
                // link to work.
                e.preventDefault();

                editArea = Y.one('#hiddenadvancededitoreditable');
                editor = editArea.ancestor('.editor_atto');

                if (editor){
                    M.mod_hsuforum.toggleAdvancedEditor(advancedEditLink);
                } else {
                    // The advanced editor isn't available yet, lets try again periodically.
                    advancedEditLink.setContent(M.util.get_string('loadingeditor', 'hsuforum'));
                    checkEditArea = setInterval(function(){
                        editor = editArea.ancestor('.editor_atto');
                        if (editor) {
                            clearInterval(checkEditArea);
                            M.mod_hsuforum.toggleAdvancedEditor(advancedEditLink);
                        }
                    }, 500);
                }

            }, document, '.hsuforum-use-advanced');

            // Submit handlers.
            rootNode.delegate('submit', form.handleFormSubmit, SELECTORS.FORM, form);
            if (addNode instanceof Y.Node) {
                addNode.on('submit', router.handleAddDiscussionRoute, router);
            }

            // On post created, update HTML, URL and log.
            form.on(EVENTS.POST_CREATED, dom.handleUpdateDiscussion, dom);
            form.on(EVENTS.POST_CREATED, dom.handleNotification, dom);
            form.on(EVENTS.POST_CREATED, router.handleViewDiscussion, router);
            form.on(EVENTS.POST_CREATED, this.handleLiveLog, this);

            // On post updated, update HTML and URL and log.
            form.on(EVENTS.POST_UPDATED, dom.handleUpdateDiscussion, dom);
            form.on(EVENTS.POST_UPDATED, router.handleViewDiscussion, router);
            form.on(EVENTS.POST_UPDATED, dom.handleNotification, dom);
            form.on(EVENTS.POST_UPDATED, this.handleLiveLog, this);

            // On discussion created, update HTML, display notification, update URL and log it.
            form.on(EVENTS.DISCUSSION_CREATED, dom.handleUpdateDiscussion, dom);
            form.on(EVENTS.DISCUSSION_CREATED, dom.handleDiscussionCreated, dom);
            form.on(EVENTS.DISCUSSION_CREATED, dom.handleNotification, dom);
            form.on(EVENTS.DISCUSSION_CREATED, router.handleViewDiscussion, router);
            form.on(EVENTS.DISCUSSION_CREATED, this.handleLiveLog, this);

            // On discussion delete, update HTML (may redirect!), display notification and log it.
            this.on(EVENTS.DISCUSSION_DELETED, dom.handleDiscussionDeleted, dom);
            this.on(EVENTS.DISCUSSION_DELETED, dom.handleNotification, dom);
            this.on(EVENTS.DISCUSSION_DELETED, this.handleLiveLog, this);

            // On post deleted, update HTML, URL and log.
            this.on(EVENTS.POST_DELETED, dom.handleUpdateDiscussion, dom);
            this.on(EVENTS.POST_DELETED, router.handleViewDiscussion, router);
            this.on(EVENTS.POST_DELETED, dom.handleNotification, dom);
            this.on(EVENTS.POST_DELETED, this.handleLiveLog, this);

            // On form cancel, update the URL to view the discussion/post.
            form.on(EVENTS.FORM_CANCELED, router.handleViewDiscussion, router);
        },

        /**
         * Inspects event object for livelog and logs it if found
         * @method handleLiveLog
         * @param e
         */
        handleLiveLog: function(e) {
            if (Y.Lang.isString(e.livelog)) {
                this.get('liveLog').logText(e.livelog);
            }
        },

        /**
         * View a discussion
         *
         * @method viewDiscussion
         * @param discussionid
         * @param [postid]
         */
        viewDiscussion: function(discussionid, postid) {
            var node = Y.one(SELECTORS.DISCUSSION_BY_ID.replace('%d', discussionid));
            if (!(node instanceof Y.Node)) {
                Y.log('Cannot view discussion because discussion node not found', 'error', 'Article');
                return;
            }
            if (!Y.Lang.isUndefined(postid)) {
                var postNode = Y.one(SELECTORS.POST_BY_ID.replace('%d', postid));
                if (postNode === null || postNode.hasAttribute('data-isdiscussion')) {
                    node.focus();
                } else {
                    postNode.get('parentNode').focus();
                }
            } else {
                node.focus();
            }
        },

        /**
         * Confirm deletion of a post
         *
         * @method confirmDeletePost
         * @param {Integer} postId
         */
        confirmDeletePost: function(postId) {
            var node = Y.one(SELECTORS.POST_BY_ID.replace('%d', postId));
            if (node === null) {
                return;
            }
            if (window.confirm(M.str.mod_hsuforum.deletesure) === true) {
                this.deletePost(postId);
            }
        },

        /**
         * Delete a post
         *
         * @method deletePost
         * @param {Integer} postId
         */
        deletePost: function(postId) {
            var node = Y.one(SELECTORS.POST_BY_ID.replace('%d', postId));
            if (node === null) {
                return;
            }
            Y.log('Deleting post: ' + postId);

            this.get('io').send({
                postid: postId,
                sesskey: M.cfg.sesskey,
                action: 'delete_post'
            }, function(data) {
                if (node.hasAttribute('data-isdiscussion')) {
                    this.fire(EVENTS.DISCUSSION_DELETED, data);
                } else {
                    this.fire(EVENTS.POST_DELETED, data);
                }
            }, this);
        }
    }
);

M.mod_hsuforum.Article = ARTICLE;
M.mod_hsuforum.init_article = function(config) {
    new ARTICLE(config);
};

/**
 * Restore editor to original position in DOM.
 */
M.mod_hsuforum.restoreEditor = function() {
    var editCont = Y.one('#hiddenadvancededitorcont');
    if (editCont) {
        var editArea = Y.one('#hiddenadvancededitoreditable');
        var editor = editArea.ancestor('.editor_atto');
        editCont.appendChild(editor);
        // Switch all editor links to hide mode.
        M.mod_hsuforum.toggleAdvancedEditor(false, true);
    }
},

/**
 * Toggle advanced editor in place of plain text editor.
 */
M.mod_hsuforum.toggleAdvancedEditor = function(advancedEditLink, forcehide, keepLink) {

    var showEditor = false;
    if (!forcehide) {
        showEditor = advancedEditLink && advancedEditLink.getAttribute('aria-pressed') === 'false';
    }

    if (advancedEditLink) {
        if (showEditor) {
            advancedEditLink.removeClass('hideadvancededitor');
        } else {
            advancedEditLink.addClass('hideadvancededitor');
        }
    }

    // @TODO - consider a better explantion of forcehide
    // Force hide is required for doing things like hiding all editors except for the link that was just clicked.
    // So if you click reply against a topic and then open the editor and then click reply against another topic and
    // then open the editor you need the previous editor link to be reset.
    if (forcehide) {
        // If advancedEditLink is not set and we are forcing a hide then we need to hide every instance and change all labels.
        if (!advancedEditLink){
            var links = Y.all('.hsuforum-use-advanced');
            for (var l = 0; l<links.size(); l++) {
                var link = links.item(l);
                if (keepLink && keepLink === link){
                    continue; // Do not process this link.
                }
                // To hide this link and restore the editor, call myself.
                M.mod_hsuforum.toggleAdvancedEditor(link, true);
            }

            return;
        }
    } else {
        // OK we need to make sure the editor isn't available anywhere else, so call myself.
        M.mod_hsuforum.toggleAdvancedEditor(false, true, advancedEditLink);
    }

    var editCont = Y.one('#hiddenadvancededitorcont'),
        editArea,
        contentEditable = advancedEditLink.previous('.hsuforum-textarea'),
        editor;

    if (editCont){
        editArea = Y.one('#hiddenadvancededitoreditable');
        editor = editArea.ancestor('.editor_atto');
        if (contentEditable){
            editArea.setStyle('height', contentEditable.getDOMNode().offsetHeight+'px');
        }
    } else {
        //@TODO - throw error
        throw "Failed to get editor";
    }

    var editorhidden = false;
    if (!editor || editor.getComputedStyle('display') === 'none'){
        editorhidden = true;
    }

    if (showEditor) {
        advancedEditLink.setAttribute('aria-pressed', 'true');
        advancedEditLink.setContent(M.util.get_string('hideadvancededitor', 'hsuforum'));
        contentEditable.hide();
        editor.show();
        contentEditable.insert(editor, 'before');
        contentEditable.insert(Y.one('#hiddenadvancededitor'), 'before');
        editArea.setContent(contentEditable.getContent());

        // Focus on editarea.
        editArea.focus();

        /**
         * Callback for when editArea content changes.
         */
        var editAreaChanged = function(){
            contentEditable.setContent(editArea.getContent());
        };

        // Whenever the html editor changes its content, update the text area.
        if (window.MutationObserver){
            M.mod_hsuforum.Article.editorMutateObserver = new MutationObserver(editAreaChanged);
            M.mod_hsuforum.Article.editorMutateObserver.observe(editArea.getDOMNode(), {childList: true, characterData: true, subtree: true});
        } else {
            // Don't use yui delegate as I don't think it supports this event type
            editArea.getDOMNode().addEventListener ('DOMCharacterDataModified', editAreachanged, false);
        }
    } else {
        advancedEditLink.setAttribute('aria-pressed', 'false');
        if (M.mod_hsuforum.Article.editorMutateObserver){
            M.mod_hsuforum.Article.editorMutateObserver.disconnect();
        }
        advancedEditLink.setContent(M.util.get_string('useadvancededitor', 'hsuforum'));
        contentEditable.show();
        if (!editorhidden) {
            // Only set content if editor wasn't hidden.
            contentEditable.setContent(editArea.getContent());
        }
        editor.hide();
    }
};
