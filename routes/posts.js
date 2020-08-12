const express = require("express");
const {
  uploadPhoto,
  getMyPosts,
  updatePost,
  deletePost,
  getFriendsPost,
} = require("../controllers/posts");
const auth = require("../middleware/auth");

const router = express.Router();

// api/v1/posts
router.route("/").post(auth, uploadPhoto).get(auth, getFriendsPost);
router.route("/me").get(auth, getMyPosts);
router.route("/:post_id").put(auth, updatePost).delete(auth, deletePost);

module.exports = router;
