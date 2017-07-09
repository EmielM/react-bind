// Simple observable/subscriber implementation

export interface Subscriber<T> {
	(value: T): void
}

export class Data<T> {
	// observable implementation

	subs: Subscriber<T>[];
	value: T|undefined;

	constructor(initial?) {
		this.subs = [];
		this.value = initial;
	}

	create() {}
	destroy() {}

	subscribe(s: Subscriber<T>) {
		if (this.subs.length === 0) {
			this.create();
		}
		this.subs.push(s);
		if (this.value !== undefined) {
			// Semantics are that we do a direct (sync) call when the value
			// is not undefined. Otherwise, we don't call until the value
			// changes.
			s(this.value);
		}
	}

	unsubscribe(s: Subscriber<T>) {
		let i = this.subs.indexOf(s);
		if (i >= 0) this.subs.splice(i, 1);
		if (this.subs.length === 0) {
			this.destroy();
		}
	}

	map<O>(mapper: {(value: T): O}) : Data<O> {
		return new MappedData(this, mapper);
	}

	set(value: T) {
		if (this.value !== value) {
			// do a direct compare
			this.value = value;
			this.subs.forEach((sub) => {
				try {
					sub(value);
				} catch(e) {
					if(console.error) {
						console.error(e);
					}
				}
			});
		}
	}
}

export class MappedData<I,O> extends Data<O> {

	upstream: Data<I>;
	sub: Subscriber<I>;

	constructor(upstream: Data<I>, mapper: {(value: I): O}) {
		super();
		this.upstream = upstream;
		this.sub = (value: I) => { this.set(mapper(value)); };
	}

	create() {
		this.upstream.subscribe(this.sub);
		if (this.upstream.value === undefined) {
			// when upstream is undefined, this.sub is not invoked
			// we do it explicitly as it might map to a value in the mapped space! 
			this.sub(undefined);
		}
	}

	destroy() {
		this.upstream.unsubscribe(this.sub);
	}
}


export class PromiseData<T> extends Data<T> {

	promise: Promise<T> | (() => Promise<T>) | false;

	constructor(promise: Promise<T>|(() => Promise<T>), initial?) {
		super(initial);

		this.promise = promise;
		// the Promise<T> variant is deprecated for normal consumers, because
		// the promise is now already doing work while it may not be necessary
		// (in case there are no observers)
	}

	create() {
		let promise = this.promise;
		if (!promise) {
			return; // already executed before
		}
		if (typeof promise === 'function') {
			promise = promise(); // starting work now
		}
		promise.then( (v) => { this.set(v); });
		this.promise = false;
	}
}

