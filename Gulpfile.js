

var gulp 			= require('gulp');
var browserSync 	=	require('browser-sync').create(),
	pngcrush 		=	require('imagemin-pngcrush'),
	favicons 		=	require('favicons');
	typographic 	=	require('typographic');
	nib			 	=	require('nib'),
	autoprefixer 	= 	require('autoprefixer'),
	lost 			= 	require('lost'),
	axis 			= 	require('axis'),
	rupture 		= 	require('rupture'),
	csswring 		= 	require('csswring'),
	cp				=	require('child_process');

var plugins 		= 	require('gulp-load-plugins')();

var messages = {
    jekyllBuild: '<span style="color: grey">Running:</span> $ jekyll build'
};

var processors = [
	require('postcss-mixins'),
	require('postcss-simple-vars'),
	require('postcss-nested'),
	require('autoprefixer-core')({ browsers: ['last 2 versions', '> 2%'] }),
	lost(),
	autoprefixer()
];

var markupFiles = [
	'**/templates/**/*.html',
	'**/jstemplates/**/*.html',
]

// Default Task

gulp.task('default', ['styles', 'browser-sync', 'watch:styles'], function() {
	gulp.watch(markupFiles, browserSync.reload);
});

gulp.task('watch:styles', function () {
	gulp.watch('**/*.styl', ['styles']);
});

// Production Task

gulp.task('production', ['styles-production'], function(){});


// Development

gulp.task('styles', function() {
	gulp.src('**/custom.styl', { base: './' })
		.pipe(plugins.sourcemaps.init())
		.pipe(plugins.stylus({
			'include css': true,
			use: [typographic(), nib(), axis(), rupture()]
			}))
		.pipe(plugins.postcss(processors))
		// .pipe(plugins.cssnano())
		.pipe(plugins.sourcemaps.write('.'))
		.pipe(gulp.dest('.'))
		.pipe(browserSync.stream({match: '**/*.css'}));
});



// Production

gulp.task('styles-production', function() {
	gulp.src('**/custom.styl', { base: './' })
		.pipe(plugins.sourcemaps.init())
		.pipe(plugins.stylus({
			'include css': true,
			use: [typographic(), nib(), axis(), rupture()]
			}))
		.pipe(plugins.postcss(processors))
		.pipe(plugins.cssnano())
		.pipe(plugins.sourcemaps.write('./'))
		.pipe(gulp.dest('.'))
		.pipe(browserSync.reload({stream:true, notify: false}));
});



// Global

gulp.task('browser-sync', function() {
    browserSync.init({
        // proxy: "yourlocal.dev"
        // proxy: "localhost:8888/papercloud/Bladnoch",
        proxy: "http://127.0.0.1:8000/",
        // server: {
        // 	baseDir: "./"
        // },
        browser: "google chrome canary",
        ghostMode: {
            clicks: true,
            location: true,
            forms: true,
            scroll: true
        }
    });
});

gulp.task('bs-reload', function() {
	browserSync.reload({notify: false});
});


// svg png sprites

gulp.task('sprites', function () {
    return gulp.src('**/images/icons/**/*.svg', { base: './' })
	    // .pipe(svgo())
        .pipe(plugins.svgSprite({
        	"dest": '.',
            "mode": {
                "css": {
                    "layout": "vertical",
                    "common": "sprite",
                    "prefix": ".sprite-%s",
                    "dimensions": true,
                    "sprite": "sprite.svg",
                    "dest": "./",
                    "bust": false,
                    "render": {
                        "styl": {
                            "dest": '.',
                            "template": "img/iconsprites/svgspritetemplate.styl"
                        }
                    }
                }
            }
        }))
	    .pipe(gulp.dest('.'))
	    .pipe(plugins.filter("**/*.svg"))
	    .pipe(plugins.svg2png())
	    .pipe(gulp.dest('.'));
});


// imagemin

gulp.task('minifyimages', function () {
    return gulp.src('**/css/images/*.png', { base: './' })
        .pipe(plugins.imagemin({
            progressive: true,
            svgoPlugins: [{removeViewBox: false}],
            use: [pngcrush()]
        }))
        .pipe(gulp.dest('.'));
});
