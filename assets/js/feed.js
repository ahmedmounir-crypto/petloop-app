document.addEventListener("DOMContentLoaded", async function () {
  var container = document.getElementById("feed-posts");
  if (!container) return; // not on the feed page

  var db = window.petloop.db;
  var emptyMsg = document.getElementById("feed-empty");

  function timeAgo(iso) {
    var diffMs = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return mins + "m";
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + "h";
    return Math.floor(hrs / 24) + "d";
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

  container.innerHTML = posts.map(function (post) {
    var pet = post.pets || {};
    var author = post.profiles || {};
    var likeCount = (post.post_likes && post.post_likes[0] && post.post_likes[0].count) || 0;
    var commentCount = (post.post_comments && post.post_comments[0] && post.post_comments[0].count) || 0;
    var avatarInner = pet.avatar_url
      ? '<img src="' + pet.avatar_url + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">'
      : '<span class="icon "><img src="' + window.petloop.speciesIcon(pet.species) + '" alt=""></span>';
    var mediaInner = post.image_url
      ? '<img src="' + post.image_url + '" alt="" style="width:100%;height:100%;object-fit:cover;">'
      : '<span class="icon "><img src="assets/icons/camera-grey.svg" alt=""></span>';

    return '' +
      '<div class="post-card">' +
      '<div class="post-head">' +
      '<div class="avatar-ring sm"><div class="avatar-inner">' + avatarInner + '</div></div>' +
      '<div class="grow"><h5>' + window.petloop.escapeHtml(pet.name || "PetLoop Member") + '</h5><span>' + window.petloop.escapeHtml(author.city || "") + (author.city ? " · " : "") + timeAgo(post.created_at) + '</span></div>' +
      '</div>' +
      '<div class="post-media">' + mediaInner + '</div>' +
      '<div class="post-actions"><span class="icon "><img src="assets/icons/heart-coral.svg" alt=""></span><span class="icon "><img src="assets/icons/comment-ink.svg" alt=""></span><span class="icon "><img src="assets/icons/share-ink.svg" alt=""></span><span class="grow"></span><span class="icon "><img src="assets/icons/bookmark-ink.svg" alt=""></span></div>' +
      '<div class="post-likes">' + likeCount + (likeCount === 1 ? " like" : " likes") + '</div>' +
      (post.content ? '<div class="post-caption"><b>' + window.petloop.escapeHtml(pet.name || "") + '</b> ' + window.petloop.escapeHtml(post.content) + '</div>' : '') +
      '<div class="post-comments">' + (commentCount > 0 ? "View all " + commentCount + " comment" + (commentCount === 1 ? "" : "s") : "No comments yet") + '</div>' +
      '</div>';
  }).join("");
});
