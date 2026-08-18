document.addEventListener("DOMContentLoaded", async function () {
  var container = document.getElementById("feed-posts");
  if (!container) return; // not on the feed page

  var db = window.petloop.db;
  var emptyMsg = document.getElementById("feed-empty");
  var sessionUser = await window.petloop.getSessionUser();

  function timeAgo(iso) {
    var diffMs = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h";
    return Math.floor(hrs / 24) + "d";
  }

  function promptLogin(action) {
    var goLogin = confirm("Log in to " + action + ". Go to the login page now?");
    if (goLogin) {
      window.location.href = "account.html?next=" + encodeURIComponent("feed.html");
    }
  }

  var res = await db.from("posts")
    .select("*, pets(name, species, avatar_url), profiles!posts_author_id_fkey(city, full_name), post_likes(count), post_comments(count)")
    .order("created_at", { ascending: false })
    .limit(30);

  var posts = res.data || [];
  if (posts.length === 0) {
    emptyMsg.style.display = "block";
    return;
  }

  var postIds = posts.map(function (p) { return p.id; });

  // Which of these posts has the current user already liked / saved?
  var likedSet = {};
  var savedSet = {};
  if (sessionUser) {
    var myLikesRes = await db.from("post_likes").select("post_id").eq("profile_id", sessionUser.id).in("post_id", postIds);
    (myLikesRes.data || []).forEach(function (r) { likedSet[r.post_id] = true; });
    var mySavedRes = await db.from("saved_posts").select("post_id").eq("profile_id", sessionUser.id).in("post_id", postIds);
    (mySavedRes.data || []).forEach(function (r) { savedSet[r.post_id] = true; });
  }

  container.innerHTML = posts.map(function (post) {
    var pet = post.pets || {};
    var author = post.profiles || {};
    var likeCount = (post.post_likes && post.post_likes[0] && post.post_likes[0].count) || 0;
    var commentCount = (post.post_comments && post.post_comments[0] && post.post_comments[0].count) || 0;
    var isLiked = !!likedSet[post.id];
    var isSaved = !!savedSet[post.id];
    var avatarInner = pet.avatar_url
      ? '<img src="' + pet.avatar_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
      : '<span class="icon "><img src="' + window.petloop.speciesIcon(pet.species) + '" alt=""></span>';
    var mediaInner = post.image_url
      ? '<img src="' + post.image_url + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
      : '<span class="icon "><img src="assets/icons/camera-grey.svg" alt=""></span>';

    return '' +
      '<div class="post-card" data-post-id="' + post.id + '">' +
      '<div class="post-head">' +
      '<div class="avatar-ring sm"><div class="avatar-inner">' + avatarInner + '</div></div>' +
      '<div class="grow"><h5>' + window.petloop.escapeHtml(pet.name || "PetLoop Member") + '</h5><span>' + window.petloop.escapeHtml(author.city || "") + (author.city ? " · " : "") + timeAgo(post.created_at) + '</span></div>' +
      '</div>' +
      '<div class="post-media">' + mediaInner + '</div>' +
      '<div class="post-actions">' +
      '<button type="button" class="icon-action like-btn" data-post-id="' + post.id + '" data-liked="' + isLiked + '" aria-label="Like"><span class="icon "><img class="like-icon" src="assets/icons/heart-' + (isLiked ? 'coral' : 'ink') + '.svg" alt=""></span></button>' +
      '<button type="button" class="icon-action comment-toggle-btn" data-post-id="' + post.id + '" aria-label="Comment"><span class="icon "><img src="assets/icons/comment-ink.svg" alt=""></span></button>' +
      '<button type="button" class="icon-action share-btn" data-post-id="' + post.id + '" aria-label="Share"><span class="icon "><img src="assets/icons/share-ink.svg" alt=""></span></button>' +
      '<span class="grow"></span>' +
      '<button type="button" class="icon-action save-btn" data-post-id="' + post.id + '" data-saved="' + isSaved + '" aria-label="Save"><span class="icon "><img class="save-icon" src="assets/icons/bookmark-' + (isSaved ? 'coral' : 'ink') + '.svg" alt=""></span></button>' +
      '</div>' +
      '<div class="post-likes" id="like-count-' + post.id + '">' + likeCount + (likeCount === 1 ? " like" : " likes") + '</div>' +
      (post.content ? '<div class="post-caption"><b>' + window.petloop.escapeHtml(pet.name || "") + '</b> ' + window.petloop.escapeHtml(post.content) + '</div>' : '') +
      '<div class="post-comments comment-toggle-btn" data-post-id="' + post.id + '" id="comment-summary-' + post.id + '" style="cursor:pointer;">' + (commentCount > 0 ? "View all " + commentCount + " comment" + (commentCount === 1 ? "" : "s") : "No comments yet") + '</div>' +
      '<div class="post-comments-panel" id="comments-panel-' + post.id + '" style="display:none;margin-top:10px;"></div>' +
      '</div>';
  }).join("");

  function updateCommentSummary(postId, count) {
    var el = document.getElementById("comment-summary-" + postId);
    if (el) el.textContent = count > 0 ? "View all " + count + " comment" + (count === 1 ? "" : "s") : "No comments yet";
  }

  async function renderComments(postId, panel) {
    panel.innerHTML = '<p class="form-hint">Loading comments...</p>';
    var cRes = await db.from("post_comments")
      .select("*, profiles!post_comments_profile_id_fkey(full_name)")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });
    var comments = cRes.data || [];

    var listHtml = comments.length === 0
      ? '<p class="form-hint">No comments yet — be the first!</p>'
      : comments.map(function (c) {
          var name = (c.profiles && c.profiles.full_name) || "PetLoop Member";
          return '<div style="padding:6px 0;font-size:14px;"><b>' + window.petloop.escapeHtml(name) + '</b> ' + window.petloop.escapeHtml(c.content) + '</div>';
        }).join("");

    var formHtml = sessionUser
      ? '<form class="add-comment-form" data-post-id="' + postId + '" style="display:flex;gap:8px;margin-top:10px;">' +
        '<input type="text" class="add-comment-input" placeholder="Write a comment..." style="flex:1;padding:8px 12px;border-radius:20px;border:1px solid var(--border, #ddd);" required>' +
        '<button type="submit" class="btn btn-coral btn-sm">Post</button>' +
        '</form>'
      : '<p class="form-hint" style="margin-top:10px;"><a href="account.html?next=feed.html">Log in</a> to comment.</p>';

    panel.innerHTML = listHtml + formHtml;

    var form = panel.querySelector(".add-comment-form");
    if (form) {
      form.addEventListener("submit", async function (e) {
        e.preventDefault();
        var input = form.querySelector(".add-comment-input");
        var text = input.value.trim();
        if (!text) return;
        var submitBtn = form.querySelector("button[type=submit]");
        submitBtn.disabled = true;
        var ins = await db.from("post_comments").insert({ post_id: postId, profile_id: sessionUser.id, content: text });
        submitBtn.disabled = false;
        if (ins.error) {
          alert("Couldn't post comment: " + ins.error.message);
          return;
        }
        input.value = "";
        await renderComments(postId, panel);
        var freshCount = await db.from("post_comments").select("*", { count: "exact", head: true }).eq("post_id", postId);
        updateCommentSummary(postId, freshCount.count || 0);
      });
    }
  }

  container.addEventListener("click", async function (e) {
    var likeBtn = e.target.closest(".like-btn");
    var saveBtn = e.target.closest(".save-btn");
    var shareBtn = e.target.closest(".share-btn");
    var commentToggle = e.target.closest(".comment-toggle-btn");

    if (likeBtn) {
      if (!sessionUser) { promptLogin("like posts"); return; }
      var postId = likeBtn.getAttribute("data-post-id");
      var currentlyLiked = likeBtn.getAttribute("data-liked") === "true";
      var icon = likeBtn.querySelector(".like-icon");
      var countEl = document.getElementById("like-count-" + postId);
      var currentCount = parseInt((countEl.textContent || "0").replace(/[^0-9]/g, ""), 10) || 0;

      likeBtn.setAttribute("data-liked", (!currentlyLiked).toString());
      icon.src = "assets/icons/heart-" + (!currentlyLiked ? "coral" : "ink") + ".svg";
      var newCount = currentlyLiked ? Math.max(0, currentCount - 1) : currentCount + 1;
      countEl.textContent = newCount + (newCount === 1 ? " like" : " likes");

      if (currentlyLiked) {
        var del = await db.from("post_likes").delete().eq("post_id", postId).eq("profile_id", sessionUser.id);
        if (del.error) {
          likeBtn.setAttribute("data-liked", "true");
          icon.src = "assets/icons/heart-coral.svg";
          countEl.textContent = currentCount + (currentCount === 1 ? " like" : " likes");
        }
      } else {
        var ins2 = await db.from("post_likes").insert({ post_id: postId, profile_id: sessionUser.id });
        if (ins2.error) {
          likeBtn.setAttribute("data-liked", "false");
          icon.src = "assets/icons/heart-ink.svg";
          countEl.textContent = currentCount + (currentCount === 1 ? " like" : " likes");
        }
      }
      return;
    }

    if (saveBtn) {
      if (!sessionUser) { promptLogin("save posts"); return; }
      var sPostId = saveBtn.getAttribute("data-post-id");
      var currentlySaved = saveBtn.getAttribute("data-saved") === "true";
      var sIcon = saveBtn.querySelector(".save-icon");

      saveBtn.setAttribute("data-saved", (!currentlySaved).toString());
      sIcon.src = "assets/icons/bookmark-" + (!currentlySaved ? "coral" : "ink") + ".svg";

      if (currentlySaved) {
        var delS = await db.from("saved_posts").delete().eq("post_id", sPostId).eq("profile_id", sessionUser.id);
        if (delS.error) {
          saveBtn.setAttribute("data-saved", "true");
          sIcon.src = "assets/icons/bookmark-coral.svg";
        }
      } else {
        var insS = await db.from("saved_posts").insert({ post_id: sPostId, profile_id: sessionUser.id });
        if (insS.error) {
          saveBtn.setAttribute("data-saved", "false");
          sIcon.src = "assets/icons/bookmark-ink.svg";
        }
      }
      return;
    }

    if (shareBtn) {
      var shPostId = shareBtn.getAttribute("data-post-id");
      var link = window.location.origin + window.location.pathname.replace(/feed\.html$/, "") + "feed.html?post=" + shPostId;
      if (navigator.share) {
        try {
          await navigator.share({ title: "PetLoop", url: link });
        } catch (err) { /* user cancelled share sheet, ignore */ }
      } else if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(link);
          alert("Link copied to clipboard!");
        } catch (err) {
          prompt("Copy this link:", link);
        }
      } else {
        prompt("Copy this link:", link);
      }
      return;
    }

    if (commentToggle) {
      var cPostId = commentToggle.getAttribute("data-post-id");
      var panel = document.getElementById("comments-panel-" + cPostId);
      if (!panel) return;
      var isOpen = panel.style.display !== "none";
      if (isOpen) {
        panel.style.display = "none";
      } else {
        panel.style.display = "block";
        await renderComments(cPostId, panel);
      }
      return;
    }
  });

  // Deep-link support: ?post=<id> opens that post's comments automatically.
  var params = new URLSearchParams(window.location.search);
  var targetPost = params.get("post");
  if (targetPost) {
    var targetCard = container.querySelector('.post-card[data-post-id="' + targetPost + '"]');
    if (targetCard) {
      targetCard.scrollIntoView({ behavior: "smooth", block: "center" });
      var targetPanel = document.getElementById("comments-panel-" + targetPost);
      if (targetPanel) {
        targetPanel.style.display = "block";
        renderComments(targetPost, targetPanel);
      }
    }
  }
});
