create table if not exists upload_keys (
	key text primary key
);

create table if not exists video_uploads (
	id integer primary key,
	uploader integer references upload_keys(key),
	uploaded_at integer,
	site text,
	site_video_id text,
	site_channel_id text,
	title text,
	channel_title text,
	view_count integer,
	description text
);