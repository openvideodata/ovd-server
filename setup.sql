create table if not exists upload_keys (
	key text primary key
);

create table if not exists video_uploads (
	id integer primary key,
	uploader text references upload_keys(key),
	uploaded_at integer,
	site text,
	video_id text,
	channel_id text,
	channel_url text,
	channel_title text,
	title text,
	view_count integer,
	description text,
	description_snippet text
);