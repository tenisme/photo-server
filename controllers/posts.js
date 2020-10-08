const path = require("path");
const connection = require("../db/mysql_connection");
const fs = require("fs");
var AWS = require("aws-sdk");

// @desc        사진1장과 내용을 업로드 하는 API
// @route       POST /api/v1/posts
// @request     photo, content, user_id(auth)
// @response    success
exports.uploadPhoto = async (req, res, next) => {
  let user_id = req.user.id;
  let photo = req.files.photo;
  let content = req.body.content;

  if (photo.mimetype.startsWith("image") == false) {
    res.status(400).json({ message: "사진 파일 아닙니다." });
    return;
  }

  if (photo.size > process.env.MAX_FILE_SIZE) {
    res.status(400).json({ message: "파일 크기가 너무 큽니다." });
    return;
  }

  photo.name = `photo_${user_id}_${Date.now()}${path.parse(photo.name).ext}`;

  // S3에 올릴 때는 필요없어지는 부분
  // let fileUploadPath = `${process.env.FILE_UPLOAD_PATH}/${photo.name}`;

  // photo.mv(fileUploadPath, async (err) => {
  //   if (err) {
  //     console.log(err);
  //     return;
  //   }
  // });

  // S3에 올릴 때 필요한 부분
  // 1. S3 의 버킷 이름과 aws 의 credential.csv 파일의 정보를 셋팅한다.
  let file = photo.data;

  AWS.config.update({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  });

  // 2. S3에 파일 업로드를 위한 파라미터를 설정한다.
  // S3를 퍼블릭으로 설정해야 읽어올 수 있다.
  const s3 = new AWS.S3();
  let params = {
    Bucket: process.env.S3_BUCKET,
    Key: photo.name,
    Body: file,
    ContentType: path.parse(photo.name).ext.split(".")[1],
    ACL: "public-read",
  };

  // S3에 파일을 업로드 하고, 성공하면 디비에 파일명 저장한다.
  s3.upload(params, async function (err, s3Data) {
    console.log(err, s3Data);
    // err이 null이면 업로드에 성공한 것

    let query =
      "insert into photo_post (user_id, photo_url, content) \
                values (?,?,?)";
    let dbData = [user_id, photo.name, content];

    try {
      [result] = await connection.query(query, dbData);
      res.status(200).json({ success: true });
      return;
    } catch (e) {
      res.status(500).json({ error: e });
      return;
    }
  });

  // 포스트맨으로 실행해본다.
};

// @desc    내가 쓴 포스트 정보 가져오기 (25개씩)
// @route   GET /api/v1/posts/me?offset=0&limit=25
// @request user_id(auth), offset, limit
// @response  success, items[], cnt
exports.getMyPosts = async (req, res, next) => {
  let user_id = req.user.id;
  let offset = req.query.offset;
  let limit = req.query.limit;

  if (!user_id || !offset || !limit) {
    res.status(400).json({ message: "파라미터가 잘 못 되었습니다." });
    return;
  }

  let query = "select * from photo_post where user_id = ? limit ? , ? ;";
  let data = [user_id, Number(offset), Number(limit)];

  try {
    [rows] = await connection.query(query, data);
    res.status(200).json({ success: true, items: rows, cnt: rows.length });
    return;
  } catch (e) {
    res.status(500).json();
    return;
  }
};

// @desc    포스팅 수정하기
// @route   PUT /api/v1/posts/:post_id
// @request user_id(auth), photo, content
// @response  success

exports.updatePost = async (req, res, next) => {
  let post_id = req.params.post_id;
  let user_id = req.user.id;
  let photo = req.files.photo;
  let content = req.body.content;

  // 이 사람의 포스팅을 변경하는것인지, 확인한다.
  let query = "select * from photo_post where id = ? ";
  let data = [post_id];

  try {
    [rows] = await connection.query(query, data);
    // 다른사람이 쓴 글을, 이 사람이 바꾸려고 하면, 401로 보낸다.
    if (rows[0].user_id != user_id) {
      req.status(401).json();
      return;
    }
  } catch (e) {
    res.status(500).json();
    return;
  }

  if (photo.mimetype.startsWith("image") == false) {
    res.stats(400).json({ message: "사진 파일 아닙니다." });
    return;
  }

  if (photo.size > process.env.MAX_FILE_SIZE) {
    res.stats(400).json({ message: "파일 크기가 너무 큽니다." });
    return;
  }

  photo.name = `photo_${user_id}_${Date.now()}${path.parse(photo.name).ext}`;

  let fileUploadPath = `${process.env.FILE_UPLOAD_PATH}/${photo.name}`;

  photo.mv(fileUploadPath, async (err) => {
    if (err) {
      console.log(err);
      return;
    }
  });

  query = "update photo_post set photo_url = ? , content = ? where id = ? ";
  data = [photo.name, content, post_id];

  try {
    [result] = await connection.query(query, data);
    res.status(200).json({ success: true });
    return;
  } catch (e) {
    res.status(500).json();
    return;
  }
};

// @desc    내 포스팅 삭제하기 (1개)
// @route   DELETE /api/v1/posts/:post_id
// @request post_id, user_id(auth)
// @response  success

exports.deletePost = async (req, res, next) => {
  let post_id = req.params.post_id;
  let user_id = req.user.id;

  if (!post_id || !user_id) {
    res.status(400).json({ message: "파라미터가 잘못 되었습니다." });
    return;
  }

  // 이 사람의 포스팅이 맞는지 확인하는 코드 // 시작
  let query = "select * from photo_post where id = ? ";
  let data = [post_id];

  let old_photo_url;
  try {
    [rows] = await connection.query(query, data);
    // 다른사람 포스팅이면, 401로 보낸다.
    if (rows[0].user_id != user_id) {
      req.status(401).json();
      return;
    }
    old_photo_url = rows[0].photo_url;
  } catch (e) {
    res.status(500).json();
    return;
  }
  // 끝. 이 사람의 포스팅이 맞는지 확인하는 코드

  fs.unlink(`${process.env.FILE_UPLOAD_PATH}/${old_photo_url}`, function (err) {
    if (err) console.log("error : " + err);
    console.log("file deleted : " + old_photo_url);
  });

  query = "delete from photo_post where id = ? ";
  data = [post_id];

  try {
    [result] = await connection.query(query, data);
    res.status(200).json({ success: true });
    return;
  } catch (e) {
    res.status(500).json();
    return;
  }
};

// @desc    내 친구들의 포스팅 불러오기 (25개씩)
// @route   GET /api/v1/posts?offset=0&limit=25
// @request user_id(auth)
// @response  success, items[], cnt

exports.getFriendsPost = async (req, res, next) => {
  let user_id = req.user.id;
  let offset = req.query.offset;
  let limit = req.query.limit;

  if (!user_id || !offset || !limit) {
    res.status(400).json();
    return;
  }

  let query =
    "select p.* \
  from photo_follow as f \
  join photo_post as p \
  on f.friend_user_id = p.user_id \
  where f.user_id = ? \
  order by p.created_at desc \
  limit ?, ? ";

  let data = [user_id, Number(offset), Number(limit)];

  try {
    [rows] = await connection.query(query, data);
    res.status(200).json({ success: true, items: rows, cnt: rows.length });
    return;
  } catch (e) {
    res.status(500).json();
    return;
  }
};
