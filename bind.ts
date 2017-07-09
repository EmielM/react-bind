import * as React from 'react';

import {Data,PromiseData} from './data';

// Binding<O,P> is a map used to execute the binding. Values in the map can be POD or Data
// or functions that return POD/Data/Promise based on props P. When a binding is such a
// function and had a bound value before, it is passed as "prev".
type Binding<P,O> = {
	//[K in keyof O]: O[K] | Data<O[K]> | ((props: P, prev?: O[K]) => O[K] | Data<O[K]> | Promise<O[K]>)
	[K in keyof O]: O[K] | Data<O[K]> | ((props: any, prev?: O[K]) => O[K] | Data<O[K]> | Promise<O[K]>)
};

// Bound is the map of an executed binding: all the keys map to a POD.
// We would like to use (B extends Bound<B>) instead of B in our typing, so the user can really
// only bind proper types. Unfortunately, typescript can't use that constraint for better type
// inference (in fact, it makes it worse). So we don't extend for now.
// https://github.com/Microsoft/TypeScript/issues/16774
type Bound = {
	[k: string]: string | number | boolean | null | {[k: string]: any} | Array<any>
	// alternative?: Bound { [k: string]: string | ... }
};

// Actions are functions that are executed with the BindingComponent as this.
type Actions<P,S> = {
	[k: string]: ( (this: React.Component<P,S>, ...args: any[]) => void );
}

// BoundActions are those same actions, but already bound so they don't need to be called
// with a proper this. Unfortunately we can't map Actions to BoundActions in a way the
// arguments and return type are transfered as well (but the this parameter gets removed).
// We choose to expose a new generic function instead of the unbound one -- the unbound
// one can only be executed without tripping the type checker by doing .call(someComponent).
// https://github.com/microsoft/typescript/issues/6606
type BoundActions<A> = {
	[K in keyof A]: ( (...args: any[]) => void );
}

function bind<P,B,A extends Actions<P,B>>(
	data: Binding<P,B>, actions: A,
	component: React.ComponentType<P & B & BoundActions<A>>
) : React.ComponentClass<P>;

function bind<P,B,A extends Actions<P,B>,B1,A1 extends Actions<P&B,B1>>(
	data1: Binding<P,B>, actions1: A,
	data2: Binding<P&B,B1>, actions2: A1,
	component: React.ComponentType<P & B & BoundActions<A> & B1 & BoundActions<A1>>
) : React.ComponentClass<P>;

function bind<P,B,A extends Actions<P,B>,B1,A1 extends Actions<P&B,B1>,B2,A2 extends Actions<P&B&B1,B2>>(
	data1: Binding<P,B>, actions1: A,
	data2: Binding<P&B,B1>, actions2: A1,
	data3: Binding<P&B&B1,B2>, actions3: A2,
	component: React.ComponentType<P & B & BoundActions<A> & B1 & BoundActions<A1> & B2 & BoundActions<A2>>
) : React.ComponentClass<P>;

function bind<P,B,A extends Actions<P,B>>(
	data: Binding<P,B>, actions: A,
	component: React.ComponentType<P & B & BoundActions<A>>
) : React.ComponentClass<P> {

	var a = [].slice.call(arguments), l = a.length;
	while (l > 3) {
		component = bind(a[l-3], a[l-2], a[l-1]) as React.ComponentType<P & B & BoundActions<A>>;
		a[l-3] = component;
		l -= 2;
	}

	class BoundComponent extends React.PureComponent<P,B> {

		static Component = component;
		static displayName = (component.displayName || component.name) + "B";

		data: {[K in keyof B]?: Data<B[K]>};
		sets: {[K in keyof B]?: ((v: B[K]) => void) };
		actions: {[K in keyof A]: (() => void)};
		loaded: 0 | 1 | 2 | 3; // unmounted, mounted, mounted+@load called, mounted+@loaded called

		constructor(props: P) {
			super(props);
			this.loaded = 0;
			this.data = {};
			this.sets = {};
			this.state = this.exec(props);

			this.actions = {};
			for (let k in actions) {
				this.actions[k] = actions[k].bind(this);
			}

			Object.assign(this as any, this.actions);
		}

		getSetter(k: keyof B) : ((v: B[keyof B]) => void) {
			// memoizes the setter per key
			if (!this.sets[k]) {
				this.sets[k] = (v) => { this.setState({[k]: v}); };
			}
			return this.sets[k] as ((v: B[keyof B]) => void);
		}

		componentWillMount() {
			this.loaded = 1;
			for (let k in this.data) {
				(this.data[k] as Data<any>).subscribe(this.getSetter(k))
			}
			if (this["@mount"]) {
				this["@mount"]();
			}
		}

		componentDidMount() {
			if (this["@mounted"]) {
				this["@mounted"]();
			}
		}

		componentWillUnmount() {
			if (this["@unmount"]) {
				this["@unmount"]();
			}
			for (let k in this.data) {
				(this.data[k] as Data<any>).unsubscribe(this.getSetter(k))
			}
			this.loaded = 0;
		}

		componentWillReceiveProps(props: P) {
			if (!this.loaded) {
				// Is componentWillReceiveProps really only called when mounted? Docs are a bit vague
				throw "illegalBindState:"+BoundComponent.displayName;
			}

			const oldData = this.data;
			this.data = {} as any;
			const state = this.exec(props);
			this.setState(state);
			for (let k in oldData) {
				if (this.data[k] !== oldData[k]) {
					(oldData[k] as Data<any>).unsubscribe(this.getSetter(k))
				}
			}
			for (let k in this.data) {
				if (oldData[k] !== this.data[k]) {
					(this.data[k] as Data<any>).subscribe(this.getSetter(k))
				}
			}
		}

		exec(props: P): B {
			let r: Partial<B> = {};
			for (let k in data) {
				let v : Binding<P,B>[keyof B] | Promise<B[keyof B]> = data[k];
				if (typeof v === 'function') {
					v = v.call(this, props, this.state ? this.state[k] : undefined) as (B[keyof B] | Data<B[keyof B]> | Promise<B[keyof B]>);
					if (v instanceof Promise) {
						// Promises can only be used from a function, because they start work in the object construction
						v = new PromiseData(v);
					}
				}
				if (v instanceof Data) {
					this.data[k] = v;
					v = v.value;
				}
				r[k] = v; // nicely inferred: v: B[keyof B]
			}

			return r as B;
		}

		render() {
			for (let k in data) {
				if (this.state[k] === undefined) {
					if (this.loaded != 1) {
						this.loaded = 1;
						if (this['@load']) this['@load']();
					}
					return loader;
				}
			}

			if (this.loaded != 2) {
				this.loaded = 2;
				if (this['@loaded']) this['@loaded']();
			}

			const props = Object.assign({}, this.props, this.state, this.actions);
			return React.createElement(component as any, props); // why is "as any" needed here? should just match two overloads
		}

		// TODO: override setState and ensure immutability by freezing some objects
	}

	return BoundComponent;
}

var loader : JSX.Element = null;

function setLoader(l : JSX.Element) {
	loader = l;
}

export default bind;
export {Data,PromiseData,setLoader};
