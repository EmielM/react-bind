react-bind
==========

`bind()` couples data sources to react components by wrapping in a higher order component
(HOC). The HOC manages the data state and ultimately passes it as props the the
sub-component, often a stateless functional component (SFC).

`bind()` uses typescript's type system to force a typed and correct data flow where
possible. It embraces *type inference* instead of explicit typing, so resulting components
don't need additional typings that have to stay in sync.

A binding is *per prop* and defined as a source/transformation, possibly based on parent props:

    prop: value | Data | (parentProps, prevValue?) => value | Data | Promise

Additionally, bind accepts a map of actions. They are prefixed with \_, will be bound to
the created HOC component and also passed down as props:

    _reset() { this.setState({form: initialData}); }

Bind accepts consecutive binding definitions, to handle more complex data dependency flows.
In effect, multiple HOCs will then be created. 

As long as one of the data values is `undefined`, bind will render a loader.

Example
-------
Here is a (complex) example for a 3 level binding. The first level component manages a query
state that, in the second component, is used to query for a list of books. The third component
paginates the book result.

```typescript
const BookList: React.ComponentType<{bookType: "fiction" | "literature"}> = bind({
    query: "",
    _query(query) {
        this.setState({query});
    }
}, {
    books: ({bookType,query}) => getBooks(bookType, query)   // getBooks() : Data<Book[]>
    page: 0,
    _next() {
        this.setState({page: this.state.page+1})
    },
    _prev() {
        this.setState({page: this.state.page-1})
    }
}, {
    books: ({books,page}) => books.slice(page * 10, 10)
    hasPrev: ({page}) => (page > 0)
    hasNext: ({books,page}) => books.length > page * 10
},
function({query,_query,books,hasPrev,_prev,hasNext,_next}) {
    // this is a normal SFC. All props should be typed appropriately
    return <div>
		Search: <input value={query} onChange={(e) => _query(e.target.value)} />
		<ul>
			{books.map( ({book}) => <li>#{book.isbn}: {book.name}</li> )}
		</ul>
		{hasPrev ? <button onClick={_prev} value="Previous"  /> : null}
		{hasNext ? <button onClick={_next} value="Next" /> : null}
	</div>;
});
```

Philosophy
----------
- Components often know their data sources. It is stupid to fetch the data in a central
  place and pass it everywhere through your component tree.
- Keeping your state->UI mapping functional is nice, prevents weird corner cases and
  generally results in good, readable code. Action logic should ideally be separated from
  this mapping.
- Data sources are often changing, and you really want a subscriber model instead of
  fetch-once (Promises). Consequently, you want proper, functional state mapping when any
  source updates.
- Redux (and alike) have some nice ideas, but there is often no need for serializable
  actions. In `react-bind`, actions are just functions and used as such. Less indirection.
- The normal React typings for typescript work okay, but using them in your code often
  introduces a lot of redundant definitions.
- Do compile-time code checking wherever possible.
- Keep code concise, prevent indirections and watch your dependencies. A lot of the npm
  people aren't really getting the memo.

Limitations
-----------
Even though the current implementation works okay'ish, typescript unfortunately doesn't
have all the features yet to make this work I originally envisioned.

- Bindings and actions are now separate arguments to the bind functions, because typescript
  cannot match on a prefix (namely, keys that start with \_ should be typed differently
  than the others).
- Type inference works "best-effort" basis and not exploring all the options breaks it
  sometimes. See https://github.com/Microsoft/TypeScript/issues/16774.
- The functions in the actions parameter are bound to a proper `this` (namely a Component
  with the proper props and state -- this means that calls such as `this.setState({a: 1})`
  in the actions are checked). Unfortunately, Typescript does not allow mapping these
  functions to a *bound* variant with the same signature that we pass down to the
  child component. See https://github.com/microsoft/typescript/issues/6606.

Feedback
--------
Very much welcome -- just open an issue for some discussion! 
