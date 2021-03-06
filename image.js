var AsciiArt = {};
var Canvas = require('canvas');
var Image = Canvas.Image;
var fs = require('fs');

var parentArt;
AsciiArt.Image = function(options){
	if(typeof options == 'string'){
		if(options.indexOf('://') !== -1){
			options = {
				uri : options
			}
		}else{
			options = {
				filepath : options
			}
		}
	}
	var ob = this;
	if(!options.alphabet) options.alphabet = 'ultra-wide';
	options.alphabet = parentArt.valueScales[options.alphabet];
	this.options = options;
	if(!this.options.renderer) this.options.renderer = 'average';
    var jobs = [];
    this.ready = function(callback){
	    jobs.push(callback);
    };
    if(this.uri){
	    throw new Error('uris not yet implemented!')
	    return;
    }
    if(this.options.filepath){
	    //todo: handle in UMD wrapper.. pass in assetloader?
	    fs.readFile(this.options.filepath, function(err, data){
		    if (err) throw err;
		    ob.data = data;
		    ob.image = new Image();
		    ob.image.src = data;
		    ob.aspectRatio = ob.image.width<ob.image.height?
		    	ob.image.width/ob.image.height:
		    	ob.image.height/ob.image.width;
		    if(
		    	(!ob.options.width) &&
			    (!ob.options.height)
		    ){
			    ob.options.width = 80;
			    ob.options.height = Math.floor((ob.image.height/ob.image.width) * 80);
		    }
		    if(ob.options.width){
			    if(!ob.options.height){
				    ob.options.height = ob.options.width * ob.aspectRatio;
			    }
		    }else{
			    if(ob.options.height){ 
				    ob.options.width = ob.options.height / ob.aspectRatio;
			    }
			}
			ob.canvas = new Canvas(ob.image.width, ob.image.height);
			ob.context = ob.canvas.getContext('2d');
			ob.context.drawImage(
		    	ob.image, 0, 0, ob.image.width, ob.image.height
		    );
		    this.ready = function(cb){ if(cb) cb() };
		    jobs.forEach(function(job){
			    if(job) job();
		    });
		    jobs = [];
		});
    }
};
AsciiArt.Image.Canvas = Canvas;
AsciiArt.Image.Image = Image;
AsciiArt.Image.prototype.write = function(location, callback){
	if(typeof location === 'function' && !callback){
		callback = location;
		location = undefined;
	}
	var ob = this;
	this.ready(function(){
		if(location && location.indexOf('://') !== -1){
			throw new Error("uris not yet implemented!")
		}else{
			AsciiArt.Image.renderers[ob.options.renderer].render(
				ob,
				function(err, text){
					if(err) return callback(err);
					if(location) fs.writeFile(location, text, function(err){
						return callback(err, text);
					});
					else callback(err, text);
				}
			);
		}
	});
}

AsciiArt.Image.Color = {};
AsciiArt.Image.Color.distance = function(r1, g1, b1, r2, g2, b2){
	return (Math.abs(r1-r2)+Math.abs(g1-g2)+Math.abs(b1-b2))/3;
}
AsciiArt.Image.Colors = function(colorList){
	this.colors = colorList;
};
AsciiArt.Image.Color.channels = function(value){
	//todo: handle, like, any other format
	//todo: cache?
	return [
		parseInt("0x"+value.substring(0,2)),
		parseInt("0x"+value.substring(2,4)),
		parseInt("0x"+value.substring(4,6))
	];
}
AsciiArt.Image.Colors.prototype.average = function(callback){
	var total = ob.colors.map(function(color){
		return AsciiArt.Image.Color.channels(color);
	}).reduce(function(a, b){
		return [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
	});
	var result = [
		Math.floor(total[0]/this.colors.length),
		Math.floor(total[1]/this.colors.length),
		Math.floor(total[2]/this.colors.length),
	];
	this.colors = result[0].toString(16)+
		result[1].toString(16)+
		result[2].toString(16);
	if(callback) callback();
}
AsciiArt.Image.Colors.prototype.reduceTo = function(count, callback){
	var done = function(){ if(callback) callback() };
	if(count === 1) this.average(done);
	else this.shrink({count: this.colors.length - count}, done);
	
}
AsciiArt.Image.Colors.prototype.shrink = function(options, callback){
	if(options && options.count){
		var cache = {};
		for(var lcv=0; lcv < options.count || 1; lcv++) this.shrink({
			weights : options.weights,
			cache : cache
		});
		if(callback) callback();
		return;
	}
	if(!options.cache) options.cache = {};
	//todo: lots of caching
	var occurances = options.occurances || {};
	var results = this.colors.map(function(thisColor){
		var theseChannels = AsciiArt.Image.Color.channels(thisColor);
		var minimum = ob.colors.map(function(thatColor){
			if(options.cache[thisColor+thatColor]) return options.cache[thisColor+thatColor];
			var thoseChannels = AsciiArt.Image.Color.channels(thatColor);
			var distance = (options.distance || AsciiArt.Image.Color.distance)(
				theseChannels.concat(thoseChannels)
			);
			var result = {
				distance : distance,
				color : thatColor
			}
			options.cache[thisColor+thatColor] = result;
			return result;
		}).reduce(function(a, b){
			if(a.distance < b.distance) return a;
			else return b;
		});
		return {
			color : thisColor,
			other : minimum.color,
			distance : minimum.distance,
			occurances : occurances[thisColor]
		}
	});
	var minimumDistance;
	results.forEach(function(result){
		if( (!minimumDistance) || result.minimumDistance < minimumDistance){
			minimumDistance = result.minimumDistance;
		}
	});
	var result = results.filter(function(result){
		result.distance == minimumDistance;
	}).reduce(function(a, b){
		return a.occurances > b.occurances?b:a;
	});
	var position = this.colors.indexOf(result.color);
	if(position === -1) throw new Error('could not find color');
	this.colors.splice(position, 1);
}

var closest = function(color, colors, names, options){
	var distances = colors.map(function(candidate){
		return (options.distance || AsciiArt.Image.Color.distance)(
			color[0], color[1], color[2],
			candidate[0], candidate[1], candidate[2]
		);
	});
	var position;
	var distance;
	distances.forEach(function(thisDistance, pos){
		if( (!distance) || distance > thisDistance ){
			distance = thisDistance;
			position = pos;
		}
	});
	return names?names[position]:colors[position];
};

AsciiArt.Image.getTerminalColor = function(r, g, b, options){
	var names = Object.keys(AsciiArt.Image.colorProfiles.darwin);
	var colors = names.map(function(name){
		return AsciiArt.Image.colorProfiles.darwin[name];
	});
	return closest([r, g, b], colors, names, options);
}

AsciiArt.Image.renderers = {};
var dir = fs.readdirSync(__dirname+'/renderers');
dir.forEach(function(file){
	var name = file.substring(0, file.indexOf('.'));
	AsciiArt.Image.renderers[name] = require(__dirname+'/renderers/'+file);
});
AsciiArt.Image.setInstance = function(art){
	Object.keys(AsciiArt.Image.renderers).forEach(function(name){
		AsciiArt.Image.renderers[name].setInstance(art);
	});
	parentArt = art;
}
AsciiArt.Image.colorProfiles = require('./color_profiles');
//todo: AsciiArt.Image.renderers.foregroundBackground
//      sample down to two colors by subsample grid, sample posistions
//      compare two-color layout to a full ASCII character map for a maximally
//      perfect two color-per character layout
AsciiArt.Image.terminalAspectRatioDistortion = 0.7;

module.exports = AsciiArt.Image;